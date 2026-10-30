#!/usr/bin/perl
# Rime 外觀設計器 —— 本地後端
# 只依賴 Perl 核心模塊(macOS 自帶 /usr/bin/perl 即可運行),只監聽 127.0.0.1。
# 用法: perl server.pl <狀態目錄> <index.html 路徑>
use strict;
use warnings;
use utf8;
use IO::Socket::INET;
use IO::Select;
use JSON::PP;
use Encode qw(decode encode);
use POSIX qw(strftime);
use Fcntl qw(:flock);
use Time::HiRes qw(time);
use File::Temp ();

$| = 1;
$SIG{PIPE} = 'IGNORE';
$SIG{CHLD} = 'IGNORE';

my ( $STATE, $INDEX ) = @ARGV;
die "usage: server.pl STATE_DIR INDEX_HTML\n" unless $STATE && $INDEX;

my $HOME     = $ENV{HOME} || die "no HOME\n";
my $RIME     = $ENV{RIME_UI_RIME_DIR} || "$HOME/Library/Rime";
my $SQUIRREL = $ENV{RIME_UI_SQUIRREL} || '/Library/Input Methods/Squirrel.app/Contents/MacOS/Squirrel';
my $BK       = "$STATE/backups";            # 普通版本(自動輪換)
my $PIN      = "$STATE/pinned";             # 基幹版本(永不被自動清理)
my $TRASH    = "$STATE/trash";              # 回收站
my $META     = "$STATE/meta.json";          # 備註、回收站時間、設置
my $SAVED    = "$STATE/saved_themes.json";   # 用戶儲存的方案(整套外觀快照);上一版另存為 saved_themes.json.prev
my $MAX_SAVED = 200;
my %COLOR_KEY = map { $_ => 1 } qw(back_color border_color text_color hilited_text_color hilited_back_color preedit_back_color
  candidate_text_color label_color comment_text_color candidate_back_color hilited_candidate_text_color
  hilited_candidate_back_color hilited_candidate_label_color hilited_comment_text_color);
my $PINGF    = "$STATE/ping";
my $INSTF    = "$STATE/instance";
my $IDLE     = $ENV{RIME_UI_IDLE}   || 150;          # 頁面關閉(心跳停止)多少秒後自動退出;要長於後台窗口被節流後的心跳間隔(約 60 秒)
my $NOPING   = $ENV{RIME_UI_NOPING} || 180;          # 啟動後多少秒內一直沒人連上就退出
my %ALLOWED  = map { $_ => 1 } qw(squirrel.custom.yaml default.custom.yaml);
my $json     = JSON::PP->new->utf8->canonical->allow_nonref;

mkdir $STATE unless -d $STATE;
mkdir $BK    unless -d $BK;
mkdir $PIN   unless -d $PIN;
mkdir $TRASH unless -d $TRASH;
if ( -s "$STATE/server.log" and ( -s "$STATE/server.log" ) > 262144 ) { if ( open my $lf, '>', "$STATE/server.log" ) { close $lf } }
unlink $PINGF;

# 後台化:由 .app 啟動器調用時(RIME_UI_DAEMON=1),脫離啟動器的進程組,
# 這樣啟動器退出後服務器仍然存活,頁面關閉後由心跳超時自動退出。
if ( $ENV{RIME_UI_DAEMON} ) {
    my $p1 = fork();
    exit 0 if $p1;
    POSIX::setsid();
    my $p2 = fork();
    exit 0 if $p2;
    chdir '/';
    open STDIN,  '<',  '/dev/null';
    open STDOUT, '>>', "$STATE/server.log";
    open STDERR, '>&', \*STDOUT;
    $| = 1;
}

# ---------- 隨機令牌 ----------
my $TOKEN = do {
    open my $r, '<:raw', '/dev/urandom' or die "no urandom: $!";
    read $r, my $b, 18;
    unpack 'H*', $b;
};

my $srv = IO::Socket::INET->new(
    Listen    => 32,
    LocalAddr => '127.0.0.1',
    LocalPort => 0,
    Proto     => 'tcp',
    ReuseAddr => 1,
) or die "listen failed: $!\n";
my $PORT = $srv->sockport;

{
    my $tmp = "$INSTF.tmp$$";
    open my $o, '>', $tmp or die "cannot write instance file: $!";
    print $o "$PORT $TOKEN $$\n";
    close $o;
    rename $tmp, $INSTF or die "rename instance: $!";
}

$SIG{TERM} = $SIG{INT} = sub { exit_clean() };

sub exit_clean {
    unlink $INSTF, $PINGF;
    exit 0;
}

# ---------- 主循環 ----------
my $sel   = IO::Select->new($srv);
my $start = time;
my $prev  = time;
my $grace = 0;
while (1) {
    my @ready = $sel->can_read(2);
    my $now = time;
    # 電腦睡眠/喚醒會讓時鐘一下跳過很多秒,此時頁面還沒來得及發心跳,不能誤判成「界面已關閉」
    $grace = $now + 60 if $now - $prev > 15;
    $prev = $now;
    for my $s (@ready) {
        my $c = $s->accept or next;
        my $pid = fork();
        if ( !defined $pid ) { close $c; next }
        if ( $pid == 0 ) {
            close $srv;
            $SIG{CHLD} = 'DEFAULT';
            $SIG{TERM} = $SIG{INT} = 'DEFAULT';
            $SIG{ALRM} = sub { exit 0 };
            alarm 20;
            eval { handle($c); 1 } or print STDERR "handler error: $@";
            exit 0;
        }
        close $c;
    }
    next if $now < $grace;
    my $last = ( stat $PINGF )[9];
    if ($last) { exit_clean() if $now - $last > $IDLE }
    else       { exit_clean() if $now - $start > $NOPING }    # 一直沒人連上
}

# ---------- 請求處理 ----------
sub handle {
    my ($c) = @_;
    binmode $c;
    my $buf = '';
    while ( $buf !~ /\r\n\r\n/ ) {
        my $n = sysread( $c, $buf, 8192, length $buf );
        return unless $n;
        return if length $buf > 65536;
    }
    my ( $head, $body ) = split /\r\n\r\n/, $buf, 2;
    $body = '' unless defined $body;
    my @lines = split /\r\n/, $head;
    my $reqline = shift @lines;
    my ( $method, $target ) = $reqline =~ m{^([A-Z]+)\s+(\S+)\s+HTTP/1\.[01]$}
      or return respond( $c, 400, 'text/plain; charset=utf-8', "bad request\n" );
    my %h;
    for my $l (@lines) {
        $h{ lc $1 } = $2 if $l =~ /^([^:]+):\s*(.*)$/;
    }

    # 防 DNS 重綁定 / 跨站請求:Host 必須是本機加本端口
    my $host = $h{host} // '';
    return respond( $c, 403, 'text/plain; charset=utf-8', "forbidden host\n" )
      unless $host =~ /^(?:127\.0\.0\.1|localhost):\Q$PORT\E$/;
    if ( defined $h{origin} && $h{origin} ne '' ) {
        return respond( $c, 403, 'text/plain; charset=utf-8', "forbidden origin\n" )
          unless $h{origin} =~ m{^http://(?:127\.0\.0\.1|localhost):\Q$PORT\E$};
    }

    my $len = $h{'content-length'} || 0;
    return respond( $c, 413, 'text/plain; charset=utf-8', "too large\n" ) if $len > 2_000_000;
    while ( length $body < $len ) {
        my $n = sysread( $c, $body, 65536, length $body );
        last unless $n;
    }

    my ( $path, $qs ) = split /\?/, $target, 2;
    my %q = parse_qs( $qs // '' );

    if ( $method eq 'GET' && ( $path eq '/' || $path eq '/index.html' ) ) {
        return respond( $c, 403, 'text/plain; charset=utf-8', "請通過應用打開本頁(缺少令牌)\n" )
          unless ( $q{t} // '' ) eq $TOKEN;
        open my $f, '<:raw', $INDEX or return respond( $c, 500, 'text/plain; charset=utf-8', "index missing\n" );
        local $/;
        my $html = <$f>;
        close $f;
        $html =~ s/__TOKEN__/$TOKEN/g;
        return respond( $c, 200, 'text/html; charset=utf-8', $html, csp => 1 );
    }

    return respond( $c, 404, 'text/plain; charset=utf-8', "not found\n" ) unless $path =~ m{^/api/};
    return respond( $c, 401, 'application/json', $json->encode( { error => 'bad token' } ) )
      unless ( $h{'x-token'} // '' ) eq $TOKEN;

    my $in = {};
    if ( $method eq 'POST' && length $body ) {
        $in = eval { $json->decode($body) };
        return jerr( $c, 400, '請求體不是合法 JSON' ) unless ref $in eq 'HASH';
    }

    if    ( $method eq 'GET'  && $path eq '/api/state' )          { return jok( $c, api_state() ) }
    elsif ( $method eq 'GET'  && $path eq '/api/backups' )        { purge_expired_trash(); return jok( $c, list_all() ) }
    elsif ( $method eq 'GET'  && $path eq '/api/backup' )         { return api_backup( $c, $q{name} ) }
    elsif ( $method eq 'POST' && $path eq '/api/apply' )          { return api_apply( $c, $in ) }
    elsif ( $method eq 'POST' && $path eq '/api/restore' )        { return api_restore( $c, $in ) }
    elsif ( $method eq 'POST' && $path eq '/api/backup/create' )  { return api_create( $c, $in ) }
    elsif ( $method eq 'POST' && $path eq '/api/backup/pin' )     { return api_pin( $c, $in ) }
    elsif ( $method eq 'POST' && $path eq '/api/backup/note' )    { return api_note( $c, $in ) }
    elsif ( $method eq 'POST' && $path eq '/api/backup/delete' )  { return api_delete( $c, $in ) }
    elsif ( $method eq 'POST' && $path eq '/api/backup/untrash' ) { return api_untrash( $c, $in ) }
    elsif ( $method eq 'POST' && $path eq '/api/backup/purge' )   { return api_purge( $c, $in ) }
    elsif ( $method eq 'POST' && $path eq '/api/settings' )       { return api_settings( $c, $in ) }
    elsif ( $method eq 'GET'  && $path eq '/api/saved' )          { return jok( $c, { themes => saved_load() } ) }
    elsif ( $method eq 'POST' && $path eq '/api/saved' )          { return api_saved( $c, $in ) }
    elsif ( $method eq 'POST' && $path eq '/api/deploy' )         { return jok( $c, deploy() ) }
    elsif ( $method eq 'POST' && $path eq '/api/clientlog' ) {    # 頁面里的 JS 錯誤上報,寫進 server.log 便於排查
        my $msg = defined $in->{msg} && !ref $in->{msg} ? substr( $in->{msg}, 0, 600 ) : '';
        $msg =~ s/[\x00-\x1f]+/ /g;
        if ( length $msg and open my $lf, '>>:utf8', "$STATE/server.log" ) { print $lf '[client ', strftime( '%F %T', localtime ), '] ', $msg, "\n"; close $lf }
        return jok( $c, { ok => JSON::PP::true } );
    }
    elsif ( $method eq 'POST' && $path eq '/api/ping' ) {
        if ( open my $pf, '>', $PINGF ) { close $pf }
        return jok( $c, { ok => JSON::PP::true } );
    }
    elsif ( $method eq 'POST' && $path eq '/api/quit' ) {
        jok( $c, { ok => JSON::PP::true } );
        close $c;
        kill 'TERM', getppid();
        return;
    }
    return jerr( $c, 404, 'unknown api' );
}

# ---------- API ----------
sub api_state {
    my %files;
    my $rime_copy = $RIME;    # decode(CHECK) 會就地清空參數,必須用副本
    my $rime_disp = eval { decode( 'UTF-8', $rime_copy, Encode::FB_CROAK ) } // $RIME;
    for my $n ( sort keys %ALLOWED ) { $files{$n} = read_text("$RIME/$n") }
    my $version;
    if ( my $inst = read_text("$RIME/installation.yaml") ) {
        $version = $1 if $inst =~ /^distribution_version:\s*"?([^"\s]+)"?/m;
    }
    return {
        rimeDir         => $rime_disp,
        rimeDirExists   => ( ( -d $RIME ) ? JSON::PP::true : JSON::PP::false ),
        files           => \%files,
        builtin         => read_text("$RIME/build/squirrel.yaml") // builtin_fallback(),
        squirrelFound   => ( ( -x $SQUIRREL ) ? JSON::PP::true : JSON::PP::false ),
        squirrelVersion => $version,
        backupDir       => $STATE,
        settings        => meta_load()->{settings},
    };
}

# 還沒部署過(沒有 build/squirrel.yaml)時,退回讀鼠鬚管安裝包里自帶的原始 squirrel.yaml
sub builtin_fallback {
    ( my $shared = $SQUIRREL ) =~ s{/MacOS/[^/]+$}{/SharedSupport/squirrel.yaml};
    return $shared ne $SQUIRREL ? read_text($shared) : undef;
}

sub api_apply {
    my ( $c, $in ) = @_;
    my $files = $in->{files};
    return jerr( $c, 400, '缺少 files' ) unless ref $files eq 'HASH' && %$files;
    return jerr( $c, 400, "Rime 目錄不存在: $RIME" ) unless -d $RIME;
    for my $n ( keys %$files ) {
        return jerr( $c, 400, "不允許寫入 $n" ) unless $ALLOWED{$n};
        my $t = $files->{$n};
        return jerr( $c, 400, "$n 內容無效" ) if !defined $t || ref $t || length($t) < 10 || length($t) > 1_000_000;
        return jerr( $c, 400, "$n 內容缺少 patch: 根節點" ) unless $t =~ /^patch:\s*$/m;
    }
    my $stamp = now_stamp();
    my ( @made, @unchanged );
    for my $n ( sort keys %$files ) {
        my $t = $files->{$n};
        $t =~ s/\r\n/\n/g;
        $t .= "\n" unless $t =~ /\n\z/;
        my $bytes = encode( 'UTF-8', $t );
        my $cur = read_raw("$RIME/$n");
        if ( defined $cur && $cur eq $bytes ) { push @unchanged, $n; next }    # 與磁盤完全一致:不寫、不備份
        my $b = backup_file( $n, stamp => $stamp, dedupe => 1 );
        push @made, $b->{name} if $b && !$b->{dup};
        write_atomic( "$RIME/$n", $bytes ) or return jerr( $c, 500, "寫入 $n 失敗: $!" );
    }
    prune_backups();
    purge_expired_trash();
    return jok( $c, { ok => JSON::PP::true, backups => \@made, unchanged => \@unchanged } );
}

sub api_backup {
    my ( $c, $name ) = @_;
    return jerr( $c, 400, '非法備份名' ) unless valid_backup($name);
    my ($path) = find_backup($name);
    return jerr( $c, 404, '備份不存在' ) unless $path;
    my $t = read_text($path);
    return jerr( $c, 404, '備份不存在' ) unless defined $t;
    return jok( $c, { name => $name, content => $t } );
}

sub api_restore {
    my ( $c, $in ) = @_;
    my @names = ref $in->{names} eq 'ARRAY' ? @{ $in->{names} } : ( defined $in->{name} ? ( $in->{name} ) : () );
    return jerr( $c, 400, '沒有指定要還原的備份' ) unless @names;
    return jerr( $c, 400, "Rime 目錄不存在: $RIME" ) unless -d $RIME;
    my %seen;
    my @todo;
    for my $name (@names) {
        return jerr( $c, 400, '非法備份名' ) unless valid_backup($name);
        my ($path) = find_backup($name);
        return jerr( $c, 404, "備份不存在: $name" ) unless $path;
        my ($kind) = $name =~ /^(squirrel|default)\.custom\./;
        return jerr( $c, 400, "同一次還原里 $kind 文件只能選一份" ) if $seen{$kind}++;
        my $bytes = read_raw($path);
        return jerr( $c, 500, "讀取失敗: $name" ) unless defined $bytes;
        push @todo, [ "$kind.custom.yaml", $bytes ];
    }
    my $stamp = now_stamp();
    my @pre;
    for my $t (@todo) {    # 還原前先把當前版本也備份,保證還原本身可撤銷
        my $b = backup_file( $t->[0], stamp => $stamp, dedupe => 1, note => '還原前自動保存' );
        push @pre, $b->{name} if $b;
    }
    for my $t (@todo) {
        write_atomic( "$RIME/$t->[0]", $t->[1] ) or return jerr( $c, 500, "還原失敗: $!" );
    }
    prune_backups();
    return jok( $c, { ok => JSON::PP::true, restored => [ map { $_->[0] } @todo ], preRestoreBackup => \@pre } );
}

sub api_create {    # 手動保存當前配置的快照(可直接設為基幹版本)
    my ( $c, $in ) = @_;
    my $stamp = now_stamp();
    my @made;
    for my $n ( sort keys %ALLOWED ) {
        my $b = backup_file( $n, stamp => $stamp, dedupe => 0, pin => ( $in->{pin} ? 1 : 0 ) );
        push @made, $b->{name} if $b;
    }
    return jerr( $c, 400, '當前沒有可保存的配置文件' ) unless @made;
    my $note = clean_note( $in->{note} );
    meta_update( sub { $_[0]{notes}{$stamp} = $note } ) if length $note;
    prune_backups();
    return jok( $c, { ok => JSON::PP::true, stamp => $stamp, names => \@made } );
}

sub api_pin {
    my ( $c, $in ) = @_;
    my @st = valid_stamps( $in->{stamps} );
    return jerr( $c, 400, '沒有指定版本' ) unless @st;
    my ( $from, $to ) = $in->{pinned} ? ( $BK, $PIN ) : ( $PIN, $BK );
    my $n = 0;
    for my $stamp (@st) {
        for my $f ( files_of_stamp( $from, $stamp ) ) {
            next if -e "$to/$f";
            $n++ if rename "$from/$f", "$to/$f";
        }
    }
    return jok( $c, { ok => JSON::PP::true, moved => $n } );    # 取消固定後不立即輪換,下次套用時才按保留規則處理
}

sub api_note {
    my ( $c, $in ) = @_;
    my ($stamp) = valid_stamps( [ $in->{stamp} ] );
    return jerr( $c, 400, '非法版本' ) unless $stamp;
    my $note = clean_note( $in->{note} );
    meta_update( sub { if ( length $note ) { $_[0]{notes}{$stamp} = $note } else { delete $_[0]{notes}{$stamp} } } );
    return jok( $c, { ok => JSON::PP::true } );
}

sub api_delete {    # 移入回收站(基幹版本不能直接刪,需先取消固定)
    my ( $c, $in ) = @_;
    my @st = valid_stamps( $in->{stamps} );
    return jerr( $c, 400, '沒有指定版本' ) unless @st;
    my $n = 0;
    my $t = time;
    meta_update( sub {
        my $m = shift;
        for my $stamp (@st) {
            for my $f ( files_of_stamp( $BK, $stamp ) ) {
                next if -e "$TRASH/$f";
                if ( rename "$BK/$f", "$TRASH/$f" ) { $m->{trashed}{$f} = { at => $t, reason => 'manual' }; $n++ }
            }
        }
    } );
    return jok( $c, { ok => JSON::PP::true, trashed => $n } );
}

sub api_untrash {
    my ( $c, $in ) = @_;
    my @st = valid_stamps( $in->{stamps} );
    return jerr( $c, 400, '沒有指定版本' ) unless @st;
    my $n = 0;
    meta_update( sub {
        my $m = shift;
        for my $stamp (@st) {
            for my $f ( files_of_stamp( $TRASH, $stamp ) ) {
                next if -e "$BK/$f";
                if ( rename "$TRASH/$f", "$BK/$f" ) { delete $m->{trashed}{$f}; $n++ }
            }
        }
    } );
    prune_backups();
    return jok( $c, { ok => JSON::PP::true, restored => $n } );
}

sub api_purge {    # 永久刪除;只能刪回收站里的文件。stamps 缺省 = 清空回收站
    my ( $c, $in ) = @_;
    my @st = ref $in->{stamps} eq 'ARRAY' ? valid_stamps( $in->{stamps} ) : ();
    my $n  = 0;
    meta_update( sub {
        my $m = shift;
        my @victims = @st ? ( map { files_of_stamp( $TRASH, $_ ) } @st ) : ( map { $_->{name} } @{ scan_dir( $TRASH, 'trash' ) } );
        for my $f (@victims) {
            next unless valid_backup($f);
            if ( unlink "$TRASH/$f" ) { $n++; delete $m->{trashed}{$f} }
        }
        gc_notes($m);
    } );
    return jok( $c, { ok => JSON::PP::true, purged => $n } );
}

sub api_settings {
    my ( $c, $in ) = @_;
    my %new;
    if ( defined $in->{keep} ) {
        my $v = int( $in->{keep} );
        return jerr( $c, 400, '保留數量必須在 5~200 之間' ) if $v < 5 || $v > 200;
        $new{keep} = $v;
    }
    if ( defined $in->{trash_days} ) {
        my $v = int( $in->{trash_days} );
        return jerr( $c, 400, '回收站保留天數必須在 0~365 之間(0 表示不自動清理)' ) if $v < 0 || $v > 365;
        $new{trash_days} = $v;
    }
    my $m = meta_update( sub { @{ $_[0]{settings} }{ keys %new } = values %new } );
    prune_backups();
    purge_expired_trash();
    return jok( $c, { ok => JSON::PP::true, settings => $m->{settings} } );
}

# ---------- 我的方案(用戶儲存的整套外觀快照) ----------
sub saved_load {
    my $t = read_raw($SAVED);
    my $d = defined $t ? eval { $json->decode($t) } : undef;
    my $l = ( ref $d eq 'HASH' && ref $d->{themes} eq 'ARRAY' ) ? $d->{themes} : [];
    return [ grep { ref $_ eq 'HASH' && defined $_->{id} && !ref $_->{id} && $_->{id} =~ /^u_[0-9a-f]{6,20}$/ } @$l ];
}

# 加鎖 → 讀 → 回調修改 → 原子寫回(回調返回非空字符串表示出錯、不寫);寫之前把上一版留作 .prev
sub saved_update {
    my ($cb) = @_;
    open my $lk, '>>', "$STATE/saved.lock" or return ( "無法加鎖: $!", [] );
    flock( $lk, LOCK_EX );
    my $list = saved_load();
    my $err  = $cb->($list);
    unless ($err) {
        my $old = read_raw($SAVED);
        write_atomic( "$SAVED.prev", $old ) if defined $old && length $old;
        write_atomic( $SAVED, $json->encode( { version => 1, themes => $list } ) ) or $err = "寫入失敗: $!";
    }
    flock( $lk, LOCK_UN );
    close $lk;
    return ( $err, $list );
}

sub clean_name {
    my ($t) = @_;
    return undef unless defined $t && !ref $t;
    $t =~ s/[\x00-\x1f\x7f]+/ /g;
    $t =~ s/^\s+|\s+$//g;
    return undef if $t eq '';
    return substr( $t, 0, 40 );
}

sub plain_val { my ($v) = @_; return !ref $v || JSON::PP::is_bool($v) }

sub clean_part {    # 一個模式(淺/深)的配色:只收已知的顏色鍵,格式嚴格校驗
    my ($p) = @_;
    return undef unless ref $p eq 'HASH' && ref $p->{colors} eq 'HASH';
    my %colors;
    for my $k ( keys %{ $p->{colors} } ) {
        return undef unless $COLOR_KEY{$k};
        my $c = $p->{colors}{$k};
        return undef unless ref $c eq 'HASH' && defined $c->{hex} && !ref $c->{hex} && $c->{hex} =~ /^#[0-9a-f]{6}$/;
        my $a = ( defined $c->{a} && !ref $c->{a} && $c->{a} =~ /^\d{1,3}$/ ) ? $c->{a} + 0 : 255;
        return undef if $a > 255;
        $colors{$k} = { hex => $c->{hex}, a => $a };
    }
    my $cs = ( defined $p->{color_space} && !ref $p->{color_space} && $p->{color_space} eq 'display_p3' ) ? 'display_p3' : 'srgb';
    my %o = ( color_space => $cs, colors => \%colors );
    if ( ref $p->{extra} eq 'HASH' ) {          # 方案里除顏色外的其他鍵:只保留簡單的鍵值
        my %e;
        for my $k ( sort keys %{ $p->{extra} } ) {
            my $v = $p->{extra}{$k};
            next unless $k =~ /^[A-Za-z0-9_]{1,40}$/ && defined $v && plain_val($v);
            $v = substr( $v, 0, 200 ) if !ref $v && length($v) > 200;
            $e{$k} = $v;
            last if keys %e >= 20;
        }
        $o{extra} = \%e if %e;
    }
    return \%o;
}

sub clean_style {
    my ($s) = @_;
    return {} unless ref $s eq 'HASH';
    my %o;
    for my $k ( sort keys %$s ) {
        next unless $k =~ /^[a-z_]{1,40}$/;
        my $v = $s->{$k};
        next unless !defined $v || plain_val($v);
        $v = substr( $v, 0, 200 ) if defined $v && !ref $v && length($v) > 200;
        $o{$k} = $v;
        last if keys %o >= 40;
    }
    return \%o;
}

sub clean_theme {
    my ($t) = @_;
    return ( undef, '方案數據格式不對' ) unless ref $t eq 'HASH';
    my $name = clean_name( $t->{name} );
    return ( undef, '請給方案起個名字' ) unless defined $name;
    my ( $light, $dark ) = ( clean_part( $t->{light} ), clean_part( $t->{dark} ) );
    return ( undef, '配色數據格式不對' ) unless $light && $dark;
    my @labels;
    if ( ref $t->{labels} eq 'ARRAY' ) {
        for my $l ( @{ $t->{labels} } ) {
            next unless defined $l && !ref $l && length $l && length $l <= 8;
            push @labels, "$l";
            last if @labels >= 12;
        }
    }
    my $ps = ( defined $t->{page_size} && !ref $t->{page_size} && $t->{page_size} =~ /^\d+$/ ) ? $t->{page_size} + 0 : 5;
    $ps = 5 if $ps < 1 || $ps > 9;
    return ( { name => $name, light => $light, dark => $dark, style => clean_style( $t->{style} ), labels => \@labels, page_size => $ps }, undef );
}

sub new_saved_id {
    my ($list) = @_;
    srand( time ^ $$ );    # 每個請求都是 fork 出來的子進程,不重新播種會拿到相同的隨機數
    while (1) {
        my $id = sprintf( 'u_%x%04x', time, int( rand 65536 ) );
        return $id unless grep { $_->{id} eq $id } @$list;
    }
}

sub api_saved {
    my ( $c, $in ) = @_;
    my $op = $in->{op} // '';
    my $id = $in->{id};
    return jerr( $c, 400, '方案 id 不合法' ) if defined $id && ( ref $id || $id !~ /^u_[0-9a-f]{6,20}$/ );
    my $newid;
    my ( $err, $list ) = saved_update( sub {
        my ($list) = @_;
        my ($cur) = defined $id ? grep { $_->{id} eq $id } @$list : ();
        my $now = int time;
        if ( $op eq 'save' ) {
            my ( $t, $e ) = clean_theme( $in->{theme} );
            return $e if $e;
            for my $x (@$list) { return '已有同名方案「' . $t->{name} . '」' if $x->{name} eq $t->{name} && ( !defined $id || $x->{id} ne $id ) }
            if ($cur) {
                %$cur = ( %$t, id => $cur->{id}, created => $cur->{created} // $now, updated => $now );
                $newid = $cur->{id};
            } else {
                return "最多保存 $MAX_SAVED 個方案,請先刪掉一些" if @$list >= $MAX_SAVED;
                $newid = defined $id ? $id : new_saved_id($list);
                unshift @$list, { %$t, id => $newid, created => $now, updated => $now };
            }
        }
        elsif ( $op eq 'rename' ) {
            return '找不到這個方案' unless $cur;
            my $name = clean_name( $in->{name} );
            return '請給方案起個名字' unless defined $name;
            for my $x (@$list) { return '已有同名方案「' . $name . '」' if $x->{name} eq $name && $x->{id} ne $cur->{id} }
            $cur->{name} = $name; $cur->{updated} = $now; $newid = $cur->{id};
        }
        elsif ( $op eq 'delete' ) {
            return '找不到這個方案' unless $cur;
            @$list = grep { $_->{id} ne $cur->{id} } @$list;
        }
        else { return '未知操作' }
        return '';
    } );
    return jerr( $c, 400, $err ) if $err;
    return jok( $c, { ok => JSON::PP::true, id => $newid, themes => $list } );
}

sub deploy {
    return { ok => JSON::PP::false, error => '找不到 Squirrel(鼠鬚管)程序' } unless -x $SQUIRREL;
    my $pid = fork();
    return { ok => JSON::PP::false, error => 'fork 失敗' } unless defined $pid;
    if ( !$pid ) {
        open STDIN,  '<',  '/dev/null';
        open STDOUT, '>',  '/dev/null';
        open STDERR, '>&', \*STDOUT;
        exec( $SQUIRREL, '--reload' ) or exit 1;
    }
    return { ok => JSON::PP::true };
}

# ---------- 備份 ----------
sub valid_backup {
    my ($n) = @_;
    return defined $n && !ref $n && $n =~ /^(?:squirrel|default)\.custom\.\d{8}-\d{6}(?:-\d+)?\.yaml$/;
}
# 版本以時間戳(秒)為組標識,所以新建版本時保證這個時間戳尚未被任何目錄(普通/基幹/回收站)占用
sub now_stamp {
    my $t = time;
    while (1) {
        my $s = strftime( '%Y%m%d-%H%M%S', localtime $t );
        my $used = 0;
        for my $d ( $BK, $PIN, $TRASH ) { if ( my @f = files_of_stamp( $d, $s ) ) { $used = 1; last } }
        return $s unless $used;
        $t++;
    }
}
sub valid_stamps {
    my ($arr) = @_;
    return () unless ref $arr eq 'ARRAY';
    my %u;
    return grep { defined $_ && !ref $_ && /^\d{8}-\d{6}$/ && !$u{$_}++ } @$arr;
}
sub clean_note {
    my ($t) = @_;
    return '' unless defined $t && !ref $t;
    $t =~ s/[\x00-\x1f\x7f]+/ /g;
    $t =~ s/^\s+|\s+$//g;
    $t = substr( $t, 0, 80 );
    return $t;
}
sub stamp_of {
    my ($n) = @_;
    return $n =~ /\.(\d{8}-\d{6})(?:-\d+)?\.yaml$/ ? $1 : undef;
}
sub seq_of {    # 同一秒內多個文件的序號後綴
    my ($n) = @_;
    return $n =~ /\.\d{8}-\d{6}-(\d+)\.yaml$/ ? $1 : 0;
}
sub files_of_stamp {
    my ( $dir, $stamp ) = @_;
    my @out;
    opendir my $d, $dir or return @out;
    for my $f ( readdir $d ) { push @out, $f if valid_backup($f) && stamp_of($f) eq $stamp }
    closedir $d;
    return sort @out;
}
sub scan_dir {
    my ( $dir, $loc ) = @_;
    my @out;
    opendir my $d, $dir or return \@out;
    for my $f ( readdir $d ) {
        next unless valid_backup($f);
        my @st = stat "$dir/$f" or next;
        my ($kind) = $f =~ /^(squirrel|default)\./;
        push @out, { name => $f, kind => $kind, stamp => stamp_of($f), seq => seq_of($f), size => $st[7], mtime => $st[9], loc => $loc };
    }
    closedir $d;
    @out = sort { $b->{stamp} cmp $a->{stamp} || $b->{seq} <=> $a->{seq} } @out;
    return \@out;
}
sub find_backup {
    my ($n) = @_;
    for my $pair ( [ $BK, 'normal' ], [ $PIN, 'pinned' ], [ $TRASH, 'trash' ] ) {
        return ( "$pair->[0]/$n", $pair->[1] ) if -f "$pair->[0]/$n";
    }
    return ();
}

sub backup_file {
    my ( $n, %o ) = @_;
    my $src = "$RIME/$n";
    return undef unless -f $src;
    my ($kind) = $n =~ /^(squirrel|default)\.custom\.yaml$/ or return undef;
    my $bytes = read_raw($src);
    return undef unless defined $bytes;
    if ( $o{dedupe} ) {    # 與同類型最新一份完全相同就不再重複保存
        my ($newest) = grep { $_->{kind} eq $kind } ( sort { $b->{stamp} cmp $a->{stamp} || $b->{seq} <=> $a->{seq} } ( @{ scan_dir( $BK, 'normal' ) }, @{ scan_dir( $PIN, 'pinned' ) } ) );
        if ($newest) {
            my ($p) = find_backup( $newest->{name} );
            my $old = $p ? read_raw($p) : undef;
            return { name => $newest->{name}, stamp => $newest->{stamp}, dup => 1 } if defined $old && $old eq $bytes;
        }
    }
    my $stamp = $o{stamp} || now_stamp();
    my $name  = "$kind.custom.$stamp.yaml";
    my $i     = 1;
    $name = "$kind.custom.$stamp-" . $i++ . ".yaml" while -e "$BK/$name" || -e "$PIN/$name" || -e "$TRASH/$name";
    my $dir = $o{pin} ? $PIN : $BK;
    write_atomic( "$dir/$name", $bytes ) or return undef;
    if ( length( $o{note} // '' ) ) {
        my $note = clean_note( $o{note} );
        meta_update( sub { $_[0]{notes}{$stamp} = $note unless length( $_[0]{notes}{$stamp} // '' ) } );
    }
    return { name => $name, stamp => $stamp };
}

sub list_all {
    my $m = meta_load();
    my @items = ( @{ scan_dir( $BK, 'normal' ) }, @{ scan_dir( $PIN, 'pinned' ) }, @{ scan_dir( $TRASH, 'trash' ) } );
    my %tot = ( normal => [ 0, 0 ], pinned => [ 0, 0 ], trash => [ 0, 0 ] );
    for my $it (@items) {
        $it->{note} = $m->{notes}{ $it->{stamp} } // '';
        if ( $it->{loc} eq 'trash' ) {
            my $t = $m->{trashed}{ $it->{name} } || {};
            $it->{trashedAt} = $t->{at} || $it->{mtime};
            $it->{reason}    = $t->{reason} || 'manual';
        }
        $tot{ $it->{loc} }[0]++;
        $tot{ $it->{loc} }[1] += $it->{size};
    }
    return {
        items    => \@items,
        settings => $m->{settings},
        dir      => $STATE,
        totals   => { map { $_ => { files => $tot{$_}[0], bytes => $tot{$_}[1] } } keys %tot },
        now      => time,
    };
}

# 超出「保留最近 N 個版本」的普通版本 → 移入回收站(基幹版本不計入、不受影響)
sub prune_backups {
    my $m    = meta_load();
    my $keep = $m->{settings}{keep};
    my %groups;
    $groups{ $_->{stamp} }++ for @{ scan_dir( $BK, 'normal' ) };
    my @stamps = sort { $b cmp $a } keys %groups;
    return unless @stamps > $keep;
    my @old = @stamps[ $keep .. $#stamps ];
    my $t   = time;
    meta_update( sub {
        my $mm = shift;
        for my $stamp (@old) {
            for my $f ( files_of_stamp( $BK, $stamp ) ) {
                next if -e "$TRASH/$f";
                $mm->{trashed}{$f} = { at => $t, reason => 'auto' } if rename "$BK/$f", "$TRASH/$f";
            }
        }
    } );
}

sub purge_expired_trash {
    my $m    = meta_load();
    my $days = $m->{settings}{trash_days};
    return unless $days > 0;
    my $limit = time - $days * 86400;
    my @gone;
    for my $it ( @{ scan_dir( $TRASH, 'trash' ) } ) {
        my $at = ( $m->{trashed}{ $it->{name} } || {} )->{at} || $it->{mtime};
        push @gone, $it->{name} if $at < $limit;
    }
    return unless @gone;
    meta_update( sub {
        my $mm = shift;
        for my $f (@gone) { delete $mm->{trashed}{$f} if unlink "$TRASH/$f" }
        gc_notes($mm);
    } );
}

# 清掉已經沒有任何文件對應的備註
sub gc_notes {
    my ($m) = @_;
    my %live;
    for my $dir ( $BK, $PIN, $TRASH ) { $live{ $_->{stamp} } = 1 for @{ scan_dir( $dir, 'x' ) } }
    for my $k ( keys %{ $m->{notes} } ) { delete $m->{notes}{$k} unless $live{$k} }
}

# ---------- 元數據(備註、回收站時間、設置),帶文件鎖 ----------
sub meta_load {
    my $t = read_raw($META);
    my $m = defined $t ? eval { $json->decode($t) } : undef;
    $m = {} unless ref $m eq 'HASH';
    $m->{notes}   = {} unless ref $m->{notes} eq 'HASH';
    $m->{trashed} = {} unless ref $m->{trashed} eq 'HASH';
    my %set = ( keep => 30, trash_days => 30 );
    %set = ( %set, %{ $m->{settings} } ) if ref $m->{settings} eq 'HASH';
    $m->{settings} = \%set;
    return $m;
}
sub meta_update {
    my ($cb) = @_;
    open my $lk, '>>', "$STATE/meta.lock" or die "meta lock: $!";
    flock( $lk, LOCK_EX );
    my $m = meta_load();
    $cb->($m);
    write_atomic( $META, $json->encode($m) ) or warn "meta write failed: $!";
    flock( $lk, LOCK_UN );
    close $lk;
    return $m;
}

# ---------- 小工具 ----------
sub read_raw {
    my ($p) = @_;
    open my $f, '<:raw', $p or return undef;
    local $/;
    my $b = <$f>;
    close $f;
    return $b;
}

sub read_text {
    my ($p) = @_;
    my $b = read_raw($p);
    return undef unless defined $b;
    my $t = eval { decode( 'UTF-8', $b, Encode::FB_CROAK ) };
    return defined $t ? $t : undef;
}

sub write_atomic {
    my ( $dest, $bytes ) = @_;
    my $mode = ( stat $dest )[2];
    my $tmp  = "$dest.uitmp$$";
    open my $o, '>:raw', $tmp or return 0;
    print $o $bytes or do { close $o; unlink $tmp; return 0 };
    close $o or do { unlink $tmp; return 0 };
    chmod( $mode & 07777, $tmp ) if defined $mode;
    rename $tmp, $dest or do { unlink $tmp; return 0 };
    return 1;
}

sub parse_qs {
    my ($s) = @_;
    my %o;
    for my $kv ( split /&/, $s ) {
        my ( $k, $v ) = split /=/, $kv, 2;
        next unless defined $k;
        $v //= '';
        for ( $k, $v ) { tr/+/ /; s/%([0-9A-Fa-f]{2})/chr hex $1/ge }
        $o{$k} = $v;
    }
    return %o;
}

sub jok  { my ( $c, $d ) = @_; respond( $c, 200, 'application/json; charset=utf-8', $json->encode($d) ) }
sub jerr { my ( $c, $code, $m ) = @_; respond( $c, $code, 'application/json; charset=utf-8', $json->encode( { error => $m } ) ) }

sub respond {
    my ( $c, $code, $ctype, $body, %o ) = @_;
    my %reason = ( 200 => 'OK', 400 => 'Bad Request', 401 => 'Unauthorized', 403 => 'Forbidden', 404 => 'Not Found', 413 => 'Payload Too Large', 500 => 'Internal Server Error' );
    $body = '' unless defined $body;
    utf8::encode($body) if utf8::is_utf8($body);
    my $csp = $o{csp}
      ? "Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; base-uri 'none'; form-action 'none'\r\n"
      : '';
    my $hdr = "HTTP/1.1 $code " . ( $reason{$code} || 'OK' ) . "\r\n"
      . "Content-Type: $ctype\r\n"
      . "Content-Length: " . length($body) . "\r\n"
      . "Cache-Control: no-store\r\n"
      . "X-Content-Type-Options: nosniff\r\n"
      . "Referrer-Policy: no-referrer\r\n"
      . $csp
      . "Connection: close\r\n\r\n";
    print $c $hdr, $body;
    return;
}
