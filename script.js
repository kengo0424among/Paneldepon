// ブロックの状態
const NEUTRAL = 0;      // 静止状態
const EXTINCT = 1;      // 発火中
const VANISH = 2;       // 消滅中
const FALLING = 3;      // 落下中
const MOVEDOWN = 4;     // 落下完了
const SWAPPING_R = 5;   // 入れ替え中
const SWAPPING_L = 6;   // 入れ替え中
const SWAPPED = 7;      // 入れ替え完了
const REVITATE = 8;     // 浮遊中
const CHECK_FLOOR = 9;  // 浮遊終了
const UNZIP = 10;       // 解凍中
// ゲーム制御
const INVINCIBLE = false;   // 無敵モード
// リプレイ機能
class ReplayManager {
    constructor(){
        this.recording = false;
        this.playing = false;
        this.frames = [];
        this.playbackFrame = 0;
    }
    startRecording(){
        this.recording = true;
        this.frames = [];
        this.playbackFrame = 0;
    }
    stopRecording(){
        this.recording = false;
    }
    recordFrame(input){
        if(this.recording){
            this.frames.push({...input});
        }
    }
    startPlayback(){
        this.playing = true;
        this.playbackFrame = 0;
    }
    stopPlayback(){
        this.playing = false;
        this.playbackFrame = 0;
    }
    getPlaybackInput(){
        if(!this.playing || this.playbackFrame >= this.frames.length){
            return null;
        }
        return this.frames[this.playbackFrame++];
    }
    save(){
        return JSON.stringify({
            frames: this.frames,
            version: 1
        });
    }
    load(data){
        try{
            const replay = JSON.parse(data);
            this.frames = replay.frames || [];
            return true;
        }catch(e){
            console.error('Failed to load replay:', e);
            return false;
        }
    }
}
const replayManager = new ReplayManager();
// 寸法
const WIDTH = 6;
const HEIGHT = 12;
const BLOCK_SIZE = 60;
const NUM = WIDTH * HEIGHT;
const BORDER_WIDTH = 16;
// イージング
const easeOutQuad = x => 1 - (1 - x) * (1 - x);
const easeOutCubic = x => 1 - (1 - x) * (1 - x) * (1 - x);
const easeInElastic = x => x ? -Math.pow(2, 10 * x - 10) * Math.sin((x * 10 - 10.75) * (Math.PI * 2) / 3) : 0;
const easeBounce = x => { // 5回バウンスする
    const X = 1 << 5;
    x *= X - 1;
    for(let i = X >> 1;i;x -= i, i = i >> 1){
        if(x <= i)return Math.sin(x * Math.PI / i) * i * 2 / X;
    }
};
// 遷移フレーム数
const SWAP_FRAME = 4;
const FALL_FRAME = 6;
const REVITATE_FRAME = 8;
const VANISH_DELAY_FRAME = 8;
const VANISH_FRAME = 40;
const UNZIP_DELAY_FRAME = 8;
const UNZIP_FRAME = 40;
const BOUNCE_FRAME = 30;
const ATTACK_READY_FRAME = 56;
const STACK_FRAME = 90;
const ATTACK_BOUNCE_FRAME = 75;
// プレイヤータイプ
const HUMAN = 0;
const MACHINE = 1;
// 見た目情報
const RELIEF = ['♥','●','▼','◆','★','▲','(^^♪'];
const LIGHT_COLORS = ['rgb(255,0,0)','rgb(0,255,0)','rgb(0,0,255)','rgb(128,0,128)','rgb(255,255,0)','rgb(0,255,255)','rgb(192,192,192)'];
const COLORS = ['rgb(192,0,0)','rgb(0,192,0)','rgb(0,0,192)','rgb(96,0,96)','rgb(192,192,0)','rgb(0,192,192)','rgb(144,144,144)'];
const DARK_COLORS = ['rgb(128,0,0)','rgb(0,128,0)','rgb(0,0,128)','rgb(64,0,64)','rgb(128,128,0)','rgb(0,128,128)','rgb(96,96,96)'];
// 点数テーブル
const COMBO_POINT = [0,50,80,150,300,400,500,700,900,1100,1300,1500,1800,2100];
const CONNECT_BONUS = [0,0,0,0,20,30,50,60,70,80,100,140,170,210,250,290,340,390,440,490,550,610,680,750,820,900,980,1060,1150,1240,1330];
// スタート画面
const startMenu = document.getElementById('startMenu');
const gamePanel = document.getElementById('game');
const gameOptions = [];
for(let i = 0;i < 4;++i){
    const obj = {none:'なし', player:'あなた', cpu:'CPU'};
    const select = document.createElement('select');
    for(let type in obj){
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = `player${i}`;
        radio.id = `player_${type}${i}`;
        startMenu.append(radio);
        const label = document.createElement('label');
        label.for = radio.id;
        label.innerText = obj[type];
        startMenu.append(label);
        obj[type] = radio;
        radio.addEventListener('change', e => {
            if('checked' in obj.cpu)
                select.disabled = !obj.cpu.checked;
        });
    }
    if(i < 2)obj.cpu.checked = true;
    else obj.none.checked = true;
    select.disabled = true;
    for(let item of [{value:0,text:'TASさん'},{value:1,text:'中級'},{value:2,text:'初心者'},{value:3,text:'接待'}]){
        const option = document.createElement('option');
        option.value = item.value;
        option.innerText = item.text;
        select.append(option);
    }
    obj.level = select;
    startMenu.append(select);
    startMenu.append(document.createElement('br'));
    gameOptions[i] = obj;
}
const startButton = document.createElement('button');
startButton.innerText = '開始';
startMenu.append(startButton);
// ブロッククラス
class Block{
    constructor(){
        this.count = 0;         // 汎用カウンタ
        this.type = -1;         // ブロックタイプ
        this.state = NEUTRAL;   // ブロック状態
        this.vanishIndex = -1;  // 消滅アニメーションを再生する際のディレイ用
        this.vanishNum = 0;     // 消滅アニメーションにかかる時間算出用
        this.bounceCount = 0;   // 着地時の揺れアニメーション用カウンタ
        this.comboCount = 0;    // このブロックが何連鎖目に消えているブロックか
        this.comboID = -1;      // 同一フレームに複数の消滅が発生した際に同時消しカウントを正確に行うためのID
        this.group = null;      // これが属しているお邪魔ブロック
        this.leader = false;    // グループリーダーかどうか
        this.toughness = 0;     // おじゃま時の体力、これが0になったら解凍される
        this.landing = false;   // 地面までつながっているか
    }
    // 無効状態にする
    reset(){
        this.state = NEUTRAL;
        this.type = -1;
        this.group = null;
        this.comboCount = 0;
        this.leader = false;
        this.landing = false;
    }
    setState(st){
        if(this.state == VANISH)this.type = -1;// 消滅アニメーション中に状態を変更させられたら空ブロックとなる
        this.state = st;
        this.count = 0;
        if(st == MOVEDOWN)this.bounceCount = BOUNCE_FRAME;
        if(st == FALLING || st == EXTINCT)this.bounceCount = 0;
    }
    // 空きブロックと見なせるか
    isVacancy() {
        return (this.type < 0 && this.state == NEUTRAL) || this.state == FALLING;
    }
    // 可視状態
    isVisible() {
        if(this.state == UNZIP)return this.toughness <= 0 || this.count <= UNZIP_FRAME + this.vanishIndex * UNZIP_DELAY_FRAME;
        return this.state == EXTINCT ? this.count & 2 : this.state != VANISH ? this.type >= 0 && this.group == null : this.count <= VANISH_FRAME + this.vanishIndex * VANISH_DELAY_FRAME;
    }
    // 入れ替え可能ブロックか
    isSwappable() {
        return this.type < 6 && this.state == NEUTRAL || (this.state == VANISH && !this.isVisible());
    }
    // 連結可能ブロックか
    isConnectable() {
        return this.type >= 0 && this.type < 6 && (this.state == NEUTRAL || (this.state == EXTINCT && this.count == 0));
    }
    // 足場になるかどうか
    isScaffolding() {
        return this.type >= 0 && this.landing && !(this.state == VANISH && !this.isVisible());
    }
    // 溢れ条件を満たすか
    isOverflow() {
        return this.type >= 0 && this.landing;
    }
    // 表示上のXオフセット量
    offsetX() {
        return this.state == SWAPPING_L || this.state == SWAPPING_R ? (this.state == SWAPPING_L ? 1 : -1) * easeOutCubic(this.count / SWAP_FRAME) * BLOCK_SIZE : 0;
    }
    // 表示上のYオフセット量
    offsetY() {
        return this.state == FALLING ? this.count * BLOCK_SIZE / FALL_FRAME : 0;
    }
    // 表示上のスケール
    scale() {
        return (this.state == VANISH ? 1.3 : 1.0) * (this.type == 6 ? this.state == UNZIP ? 0.3 : 0.6 : 1.0);
    }
    // マークのオフセット量
    offsetReliefY() {
        return easeInElastic(this.bounceCount / BOUNCE_FRAME) * BLOCK_SIZE / 4;
    }
    isExplosion(){
        return this.isUnzipped() || this.state == VANISH && this.count == VANISH_FRAME + this.vanishIndex * VANISH_DELAY_FRAME + 1;
    }
    isUnzipped(){
        return this.state == UNZIP && this.count == UNZIP_FRAME + this.vanishIndex * UNZIP_DELAY_FRAME + 1;
    }
    // 状態更新
    update(){
        if(this.bounceCount){
            this.bounceCount--;
        }
        switch(this.state){
            case NEUTRAL:
                this.comboCount = 0;
                this.comboID = -1;
                return;
            case EXTINCT:
                if(this.count == 50)this.setState(VANISH);
                break;
            case VANISH:
                if(this.count == VANISH_FRAME + this.vanishNum * VANISH_DELAY_FRAME)this.setState(NEUTRAL);
                break;
            case UNZIP:
                if(this.count == UNZIP_FRAME + this.vanishNum * UNZIP_DELAY_FRAME)this.setState(NEUTRAL);
                break;
            case FALLING:
                if(this.count == FALL_FRAME - 1)this.setState(MOVEDOWN);
                break;
            case SWAPPING_L:
                if(this.count == SWAP_FRAME)this.setState(SWAPPED);
                break;
            case REVITATE:
                if(this.count == REVITATE_FRAME)this.setState(CHECK_FLOOR);
                break;
        }
        this.count++;
    }
}
// アニメーションエフェクト
class Effect{
    properties = {};
    keys = [];
    startProperties = {};
    target = {};
    ease = x => x;
    frame = 1;
    counter = 0;
    finalyzer = () => {};
    start(){
        for(let p in this.properties){
            this.startProperties[p] = this.target[p];
        }
    }
    update(){
        const t = this.ease(this.counter / this.frame);
        for(let p in this.properties){
            const parts = /([^-\d.]*)([-\d.]+)(\D*)/.exec(this.startProperties[p]);
            const value = parseFloat(parts[2]);
            const property = this.properties[p];
            this.target[p] = parts[1] + (isNaN(property) ? property(t, value) : value + t * (property - value)) + parts[3];
        }
        if(this.counter in this.keys){
            for(let key of this.keys[this.counter]){
                for(let k in key)
                    this.target[k] = key[k];
            }
        }
        return this.counter++ == this.frame;
    }
}
const effects = [];
const r2 = 1 / Math.sqrt(2);
// 爆発エフェクト
function explosion(parent, x, y){
    let size = BLOCK_SIZE / 2;

    // 波紋エフェクト（複数層）
    for(let i = 0; i < 3; i++){
        const wave = document.createElement('div');
        Object.assign(wave.style, {
            position: 'absolute',
            left: `${x - BLOCK_SIZE / 2}px`,
            top: `${y - BLOCK_SIZE / 2}px`,
            width: `${BLOCK_SIZE}px`,
            height: `${BLOCK_SIZE}px`,
            borderRadius: '50%',
            border: '3px solid rgba(255, 200, 100, 0.8)',
            pointerEvents: 'none',
            opacity: '0.8',
        });
        parent.append(wave);

        const waveEffect = new Effect();
        waveEffect.properties = {
            opacity: 0,
            width: BLOCK_SIZE * (4 + i),
            height: BLOCK_SIZE * (4 + i),
        };
        waveEffect.target = wave.style;
        waveEffect.ease = easeOutCubic;
        waveEffect.frame = 25 + i * 5;
        waveEffect.finalyzer = () => wave.remove();
        effects.push(waveEffect);
        waveEffect.start();
    }

    // 中心の光フラッシュ（より強烈に）
    const flash = document.createElement('div');
    Object.assign(flash.style, {
        position: 'absolute',
        left: `${x - BLOCK_SIZE * 1.5}px`,
        top: `${y - BLOCK_SIZE * 1.5}px`,
        width: `${BLOCK_SIZE * 3}px`,
        height: `${BLOCK_SIZE * 3}px`,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,240,150,0.9) 20%, rgba(255,180,80,0.6) 40%, rgba(255,100,50,0) 70%)',
        opacity: '1',
        pointerEvents: 'none',
        boxShadow: '0 0 40px rgba(255, 200, 100, 0.8)',
    });
    parent.append(flash);
    const flashEffect = new Effect();
    flashEffect.properties = {
        opacity: 0,
        width: BLOCK_SIZE * 4,
        height: BLOCK_SIZE * 4,
    };
    flashEffect.target = flash.style;
    flashEffect.ease = easeOutCubic;
    flashEffect.frame = 25;
    flashEffect.finalyzer = () => flash.remove();
    effects.push(flashEffect);
    flashEffect.start();

    // パーティクルを8方向 + ランダムに生成
    const createParticle = (dx, dy, speedMult = 1) => {
        const particleSize = (0.3 + Math.random() * 0.4) * size;
        const angle = Math.random() * 360;

        const star = document.getElementById('star').cloneNode(true);
        Object.assign(star.style, {
            position: 'absolute',
            left: `${x - 0.5 + dx * BLOCK_SIZE / 4}px`,
            top: `${y - 0.5 + dy * BLOCK_SIZE / 4}px`,
            visibility: 'visible',
            transform: `scale(${particleSize}) rotate(${angle}deg)`,
            strokeWidth: 1 / particleSize,
            opacity: '1',
        });
        parent.append(star);

        const distance = 1.2 + Math.random() * 0.8;
        const duration = 12 + Math.random() * 8;
        const effect = new Effect();
        effect.properties = {
            left: x - 0.5 + dx * BLOCK_SIZE * distance * speedMult,
            top: y - 0.5 + dy * BLOCK_SIZE * distance * speedMult,
            opacity: 0,
        };
        effect.target = star.style;
        effect.ease = easeOutCubic;
        effect.frame = duration;
        effect.keys = {
            [Math.floor(duration * 0.5)]: [{transform: `scale(${particleSize}) rotate(${angle + 180}deg)`}],
        };
        effect.finalyzer = () => star.remove();
        effects.push(effect);
        effect.start();
    };

    // 8方向のパーティクル
    createParticle(1, 0);
    createParticle(-1, 0);
    createParticle(0, 1);
    createParticle(0, -1);
    createParticle(r2, r2);
    createParticle(-r2, r2);
    createParticle(r2, -r2);
    createParticle(-r2, -r2);

    // ランダムな方向の追加パーティクル（増量）
    for(let i = 0; i < 12; i++){
        const angle = Math.random() * Math.PI * 2;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        createParticle(dx, dy, 0.5 + Math.random() * 0.8);
    }

    // 小さな破片パーティクル（増量＋カラフル）
    for(let i = 0; i < 20; i++){
        const angle = Math.random() * Math.PI * 2;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const particle = document.createElement('div');
        const hue = Math.random() * 360;
        const particleSize = 2 + Math.random() * 4;
        Object.assign(particle.style, {
            position: 'absolute',
            left: `${x}px`,
            top: `${y}px`,
            width: `${particleSize}px`,
            height: `${particleSize}px`,
            borderRadius: '50%',
            backgroundColor: `hsl(${hue}, 100%, ${60 + Math.random() * 20}%)`,
            opacity: '1',
            boxShadow: `0 0 ${particleSize * 2}px hsl(${hue}, 100%, 70%)`,
        });
        parent.append(particle);

        const distance = 0.8 + Math.random() * 1.5;
        const duration = 10 + Math.random() * 15;
        const effect = new Effect();
        effect.properties = {
            left: x + dx * BLOCK_SIZE * distance,
            top: y + dy * BLOCK_SIZE * distance + Math.random() * 20 - 10,
            opacity: 0,
        };
        effect.target = particle.style;
        effect.ease = easeOutCubic;
        effect.frame = duration;
        effect.finalyzer = () => particle.remove();
        effects.push(effect);
        effect.start();
    }

    // 光の線（放射状）
    for(let i = 0; i < 8; i++){
        const angle = (Math.PI * 2 * i) / 8;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const line = document.createElement('div');
        Object.assign(line.style, {
            position: 'absolute',
            left: `${x}px`,
            top: `${y}px`,
            width: '2px',
            height: `${BLOCK_SIZE * 1.5}px`,
            background: 'linear-gradient(to bottom, rgba(255, 255, 200, 1), rgba(255, 200, 100, 0))',
            transformOrigin: 'top',
            transform: `rotate(${angle}rad)`,
            opacity: '0.9',
            pointerEvents: 'none',
        });
        parent.append(line);

        const lineEffect = new Effect();
        lineEffect.properties = {
            opacity: 0,
            height: BLOCK_SIZE * 2.5,
        };
        lineEffect.target = line.style;
        lineEffect.ease = easeOutCubic;
        lineEffect.frame = 15;
        lineEffect.finalyzer = () => line.remove();
        effects.push(lineEffect);
        lineEffect.start();
    }
}
// コンボエフェクト
function comboBonus(parent, x, y, combo){
    var point = document.createElement('div');
    Object.assign(point.style, {
        position : 'absolute',
        left:`${x}px`,
        top:`${y}px`,
        width:`${BLOCK_SIZE}px`,
        height:`${BLOCK_SIZE * 0.75}px`,
        fontSize:`${BLOCK_SIZE * 0.75}px`,
        fontStyle:'italic',
        color:'#e33',
        webkitTextStroke:'2px #fff',
        textStroke:'2px #fff',
        zIndex:'2',
    });
    point.innerText = combo;
    parent.append(point);
    const effect = new Effect();
    effect.properties = {
        top:y - BLOCK_SIZE,
    };
    effect.target = point.style;
    // 5回バウンドするようなイージング関数
    effect.ease = x => easeBounce(Math.min(x * 2, 1)); // x = 0.5でバウンド終了
    effect.frame = 90;
    effect.finalyzer = () => point.remove();
    effects.push(effect);
    effect.start();
}
// 攻撃エフェクト
function attackEffect(parent, fromX, fromY, fromSize, toX, toY, toSize){
    var attack = document.createElement('div');
    fromX -= fromSize * 0.5;
    fromY -= fromSize * 0.5;
    toX -= toSize * 0.5;
    toY -= toSize * 0.5;
    const vx = toX - fromX;
    const vy = toY - fromY;
    const midX = toX - vx;
    const midY = toY - vy * 0.5;
    Object.assign(attack.style, {
        position : 'absolute',
        left:`${fromX}px`,
        top:`${fromY}px`,
        width:`${fromSize}px`,
        height:`${fromSize}px`,
        borderRadius:`${fromSize * 0.5}px`,
        backgroundColor:'rgba(255,255,255,0.8)',
        boxShadow:`0px 0px ${fromSize * 2}px ${fromSize * 2}px rgba(20,192,255,0.8), 0px 0px ${fromSize * 2 / 3}px ${fromSize}px rgba(255,255,255,0.8)`,
    });
    parent.append(attack);
    const effect = new Effect();
    effect.properties = {
        left:t => (1 - t) * (1 - t) * fromX + 2 * (1 - t) * t * midX + t * t * toX,
        top:t => (1 - t) * (1 - t) * fromY + 2 * (1 - t) * t * midY + t * t * toY,
        borderRadius:toSize * 0.5,
        width:toSize,
        height:toSize,
    };
    effect.target = attack.style;
    effect.ease = x => Math.min(1, Math.max(0, x * 2.5 - 1));
    effect.frame = 70;
    effect.finalyzer = () => attack.remove();
    effects.push(effect);
    effect.start();
}
// 同時消しによるお邪魔量計算
function calcConnectAttack(connect){
    if(connect <= 3)return [];
    const half = WIDTH >> 1;
    connect -= 4
    if(connect < WIDTH - half + 1)return [half + connect];
    connect -= WIDTH - half + 1;
    if(connect < (WIDTH - half) << 1)return [half + ((connect + 1) >> 1), half + (connect >> 1) + 1];
    connect -= (WIDTH - half) << 1;
    let row = [3,4,4,4,4,4,4,6,6,6,6,6,6,6,8][Math.min(connect, 14)];
    return Array(row).fill(WIDTH);
}

// ゲームインスタンス作成
function Game(gameController, playerID, panel, playerType, options){
// メインキャンバス
const canvas = document.createElement('canvas');
Object.assign(canvas.style, {
    position:'absolute',
    left:'0px',
    top:'0px',
    transition:'filter 0.666s'
});
canvas.classList.add('field');
Object.assign(canvas, { width:BLOCK_SIZE * WIDTH, height:BLOCK_SIZE * HEIGHT });
const g = canvas.getContext('2d');
panel.append(canvas);

// GAME OVERテキスト
const game_over = document.createElement('div');
Object.assign(game_over.style, {
    position:'absolute',
    width:`${BLOCK_SIZE * WIDTH}px`,
    height:`${BLOCK_SIZE * HEIGHT}px`,
    left:'0px',
    top:'0px',
    lineHeight:`${BLOCK_SIZE * HEIGHT}px`,
    fontSize:`${BLOCK_SIZE}px`
});
game_over.classList.add('message');
panel.append(game_over);

// おじゃま待機表示
const stacks = document.createElement('div');
Object.assign(stacks.style, {
    position:'absolute',
    left:`${BORDER_WIDTH}px`,
    top:`-${BLOCK_SIZE >> 1}px`,
    width:`${BLOCK_SIZE * WIDTH}px`,
    height:`${BLOCK_SIZE >> 1}px`,
    overflow:'hidden',
});
panel.append(stacks);

// エフェクトレイヤー
const effectLayer = document.createElement('div');
Object.assign(effectLayer.style, {
    position:'absolute',
    left:'0px',
    top:'0px',
});
effectLayer.classList.add('message');
panel.append(effectLayer);

// ブロック配列を1次元で作成
let blocks = [];
for(let i = -NUM;i < NUM;++i)blocks[i] = new Block();
// 予告ブロック配列作成
let next = Array(WIDTH);
// 予告ブロックを生成
const genNext = () => {
    for(let i = 0;i < WIDTH;++i){
        let exclude = blocks[i + (HEIGHT - 1) * WIDTH].type;
        if(exclude != blocks[i + (HEIGHT - 2) * WIDTH].type){
            exclude = -1;
        }
        // ポップしたときに勝手に消えてしまわないように色を抽選
        do {
            next[i] = Math.floor(Math.random() * (exclude < 0 ? 6 : 5));
            next[i] += next[i] == exclude;
        } while(i && next[i - 1] == next[i]);
    }
};

let x;  // カーソル位置
let y;
let counter;
let raiseCount;
let raiseTime;
let comboID;
let score;
let hiscore;
let showScore;
let panelBounce;
const attacks = [];
// スコアボード
const scoreText = document.createElement('div');
Object.assign(scoreText.style, {
    position : 'absolute',
    top : `${HEIGHT * BLOCK_SIZE + BORDER_WIDTH * 2}px`,
    width : `${WIDTH * BLOCK_SIZE + BORDER_WIDTH * 2}px`,
    fontSize : `${BLOCK_SIZE * 0.5}px`,
});
panel.append(scoreText);
if(playerType == HUMAN) {
    hiscore = localStorage.hiscore || 0;
    showScore = () => {
        if(hiscore < score){
            localStorage.hiscore = hiscore = score;
        }
        scoreText.innerHTML = `<p class="left">Score</p><p class="right">${score}</p><p class="left">HiScore</p><p class="right">${hiscore}</p>`;
    };
}else{
    hiscore = 0;
    showScore = () => {
        if(hiscore < score){
            hiscore = score;
        }
        scoreText.innerHTML = `<p class="left">Score</p><p class="right">${score}</p><p class="left">HiScore</p><p class="right">${hiscore}</p>`;
    };
}
const player = function(){
    class Player {
        moveUp = false;
        moveDown = false;
        moveRight = false;
        moveLeft = false;
        swap = false;
        haste = false;
    }
    let player = new Player();
    switch(playerType){
        case HUMAN:
            (function(){
                // キーイベント
                let upKey = false;
                let leftKey = false;
                let rightKey = false;
                let downKey = false;
                let swapKey = false;
                let raiseKey = false;
                window.addEventListener('keydown', function(ev) {
                    switch(ev.keyCode){
                        case 37:// left
                        leftKey=true;
                        break;
                        case 38:// up
                        upKey=true;
                        break;
                        case 39:// right
                        rightKey=true;
                        break;
                        case 40:// down
                        downKey=true;
                        break;
                        case 65:// A
                        swapKey = !ev.repeat;
                        break;
                        case 83:// S
                        if(!ev.repeat)raiseKey = true;
                        break;
                    }
                });
                window.addEventListener('keyup', function(ev) {
                    switch(ev.keyCode){
                        case 83:// S
                        raiseKey = false;
                        break;
                    }
                });
                player.reset = function(){
                    upKey = false;
                    leftKey = false;
                    rightKey = false;
                    downKey = false;
                    swapKey = false;
                    haste = false;
                };
                player.update = function(){
                    // リプレイ再生中は記録された入力を使用
                    if(replayManager.playing){
                        const replayInput = replayManager.getPlaybackInput();
                        if(replayInput){
                            this.moveUp = replayInput.moveUp;
                            this.moveDown = replayInput.moveDown;
                            this.moveRight = replayInput.moveRight;
                            this.moveLeft = replayInput.moveLeft;
                            this.swap = replayInput.swap;
                            this.haste = replayInput.haste;
                        }
                    }else{
                        this.moveUp = upKey;
                        this.moveDown = downKey;
                        this.moveRight = rightKey;
                        this.moveLeft = leftKey;
                        this.swap = swapKey;
                        this.haste = raiseKey;

                        // 入力を記録
                        replayManager.recordFrame({
                            moveUp: this.moveUp,
                            moveDown: this.moveDown,
                            moveRight: this.moveRight,
                            moveLeft: this.moveLeft,
                            swap: this.swap,
                            haste: this.haste
                        });
                    }

                    upKey = false;
                    leftKey = false;
                    rightKey = false;
                    downKey = false;
                    swapKey = false;
                };
            })();
            break;
        case MACHINE:
            (function(){
                const SEARCH = 0;
                const MOVE = 1;
                let state = SEARCH;
                let commands;
                let wait = 0;
                const turnWait = options?.wait || 0;
                const aggressivity = options?.aggressivity || 3;
                player.reset = function(){
                    state = SEARCH;
                    commands = null;
                    wait = 0;
                };
                player.update = function(){
                    this.haste = false;
                    switch(state){
                        case SEARCH:
                            // ブロック補充
                            for(let i = 0;i < NUM;++i){
                                if(blocks[i].type >= 0){
                                    this.haste = i >= WIDTH * (HEIGHT >> 2);
                                    break;
                                }
                            }
                            const search = (x, y, minLength) => {
                                const b = blocks[x + y * WIDTH];
                                if(b.state != NEUTRAL || b.type < 0 || b.type >= 6)return;
                                const candidate = [{x:x, y:y}];
                                // 縦方向に最大5つ同じ色を繋げられる場所を探す
                                for(let j = y;j-- > 1;){
                                    let discovery = false;
                                    for(let i = 0;i < WIDTH;++i){
                                        const d = blocks[i + j * WIDTH];
                                        if(d.state == NEUTRAL && b.type == d.type){
                                            // X地点まで足場あるかチェック
                                            for(let k = i;!blocks[k + (j + 1) * WIDTH].isVacancy();k += Math.sign(x - k)){
                                                if(k == x){
                                                    candidate.push({x:i, y:j});
                                                    discovery = true;
                                                    break;
                                                }
                                            }
                                            if(discovery)break;
                                        }
                                    }
                                    if(!discovery || candidate.length == 5)break;
                                }
                                if(candidate.length >= 4){
                                    candidate.push(candidate.splice(2,1)[0]);
                                }
                                return candidate.length >= minLength ? candidate : null;
                            }
                            if(!this.haste){
                                // 尖ったところを均す
                                for(let y = 1;y < HEIGHT - 1;++y){
                                    for(let x = 0;x < WIDTH;++x){
                                        const b = blocks[x + y * WIDTH];
                                        if(b.state == NEUTRAL && b.type >= 0 && b.type < 6){
                                            let candidate = WIDTH << 1;
                                            for(let i = x + 1;i < WIDTH && blocks[i + y * WIDTH].type < 0;++i){
                                                if(blocks[i + (y + 1) * WIDTH].isVacancy()){
                                                    candidate = i;
                                                    break;
                                                }
                                            }
                                            for(let i = x - 1;i >= 0 && i > x - (candidate - x) && blocks[i + y * WIDTH].type < 0;--i){
                                                if(blocks[i + (y + 1) * WIDTH].isVacancy()){
                                                    candidate = i;
                                                    break;
                                                }
                                            }
                                            if(candidate < WIDTH){
                                                commands = [];
                                                do {
                                                    x -= candidate < x;
                                                    commands.push({x:x, y:y});
                                                    x += candidate > x;
                                                }while(x != candidate);
                                                y = HEIGHT;
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                            // 消せそうなところを検索
                            if(!commands){
                                const side = counter & 1;
                                for(let y = HEIGHT;y-- > 3;){
                                    for(let i = 0;i != WIDTH;++i){
                                        const x = side ? i : WIDTH - i - 1;
                                        const candidate = search(x, y, this.haste ? aggressivity : 3);
                                        if(candidate){
                                            commands = [];
                                            for(let i = 1;i < candidate.length;++i){
                                                let t = candidate[i];
                                                const dir = Math.sign(x - t.x);
                                                for(;x != t.x + (y == t.y ? dir : 0);t.x += dir){
                                                    commands.push({x:t.x + (dir < 0 ? -1 : 0), y:t.y});
                                                }
                                            }
                                            y = 0;
                                            break;
                                        }
                                    }
                                }
                            }
                            if(commands){
                                state = MOVE;
                            }else if(!this.haste){
                                commands = [{x:Math.floor(Math.random() * (WIDTH - 1)), y:Math.floor(Math.random() * (HEIGHT - 1)) + 1}];
                            }
                            break;
                        case MOVE:
                            for(let b of blocks){
                                if(b.state == EXTINCT && b.count == 0){
                                    commands = null;
                                    break;
                                }
                            }
                            // 移動コマンド処理
                            if(wait == 0 && commands?.length){
                                let c = commands[0];
                                this.swap = false;
                                if(c.x == x && c.y == y){
                                    const left = blocks[x + y * WIDTH];
                                    const right = blocks[x + 1 + y * WIDTH];
                                    if(left.isSwappable() && right.isSwappable()){
                                        commands.splice(0, 1);
                                        this.swap = true;
                                        wait = turnWait;
                                    }else
                                    if(left.type == 6 || right.type == 6){
                                        wait = 0;
                                        commands = null;
                                        state = SEARCH;// 何か消せたら探索モードへ戻る
                                    }
                                }else{
                                    wait = turnWait >> 1;
                                }
                                this.moveLeft = c.x < x;
                                this.moveRight = c.x > x;
                                this.moveUp = c.y < y;
                                this.moveDown = c.y > y;
                            }else{
                                this.swap = false;
                                this.moveLeft = false;
                                this.moveRight = false;
                                this.moveUp = false;
                                this.moveDown = false;
                                if(wait > 0)wait--;
                                else{
                                    commands = null;
                                    state = SEARCH;// 何か消せたら探索モードへ戻る
                                }
                            }
                            break;
                    }
                };
            })();
            break;
    }
    return player;
}();

// ゲーム初期化
const resetGame = () => {
    for(let x = 0;x < WIDTH;++x){
        for(let y = 1 - HEIGHT;y < HEIGHT;++y){
            const b = blocks[x + y * WIDTH];
            b.reset();
            if(y >= HEIGHT >> 1){
                // 開始直後にブロックが勝手に消えないよう隣接を確認しながら初期化
                let color;
                do{
                    color = Math.floor(Math.random() * 6);
                }while((x >= 2 && color == blocks[x - 1 + y * WIDTH].type && color == blocks[x - 2 + y * WIDTH].type) ||
                    (y >= 2 && color == blocks[x + (y - 1) * WIDTH].type && color == blocks[x + (y - 2) * WIDTH].type));
                    b.type = color;
            }else{
                b.type = -1;
            }
            b.setState(NEUTRAL);
        }
    }
    // 時間差連鎖テスト用
    // let ii = 0;
    // for(let t of [
    //     0,1,-1,-1,-1,-1,
    //     2,3,-1,-1,-1,-1,
    //     2,3,-1,-1,-1,-1,
    //     4,4,4,-1,-1,-1,
    //     2,3,1,1,-1,-1,
    //     2,0,0,5,-1,-1,
    // ])blocks[ii++].type = t;

    genNext();

    x = WIDTH >> 1;
    y = HEIGHT >> 1;
    counter = 0;
    raiseCount = 0;
    raiseTime = 600;
    comboID = 0;
    score = 0;
    panelBounce = 0;
    showScore?.call();
    for(let a of attacks)a.finalyze();
    attacks.length = 0;
    player.reset();
    game_over.style.visibility = 'hidden';
    game_over.style.filter = `blur(${BLOCK_SIZE / 4}px)`;
    canvas.style.filter = 'blur(0px)';
    g.filter = 'none';

    gameController.addEventListener('frame', updateFunc);
};
gameController.addEventListener('reset', resetGame);
// ゲーム終了
const gameOver = (message) => {
    game_over.style.visibility = 'visible';
    game_over.style.transition = 'filter 0.666s';
    game_over.style.filter = 'blur(0px)';
    game_over.innerText = message;
    canvas.style.filter = `blur(${BLOCK_SIZE / 4}px)`;
    gameController.removeEventListener('frame', updateFunc);
};
gameController.addEventListener('settle', e => {
    if(e.winner == playerID)gameOver('WIN!!');
    if(e.draw?.find(id => id == playerID) !== undefined)gameOver('DRAW');
    if(e.lose == playerID)gameOver('LOSE');
    if(e.gameOver == playerID)gameOver('GAME OVER');
});
const createAttack = power => {
    // 上部のおじゃま表示
    const BOX_HEIGHT = BLOCK_SIZE >> 1;
    const BOX_WIDTH = BOX_HEIGHT * 1.5;
    const stack = document.createElement('div');
    const left = stacks.childNodes.length * BOX_WIDTH;
    Object.assign(stack.style, {
            position:'absolute',
            top:'0px',
            left:`${left}px`,
            width:`${BOX_WIDTH}px`,
            height:`${BOX_HEIGHT}px`,
            transition:'left 0.5s',
            visibility:'hidden',
        });
    stacks.append(stack);
    let x = 0;
    let boxWidth = BOX_WIDTH - 2;
    let boxHeight = BOX_HEIGHT - 2;
    let text;
    if(power > 0){
        boxWidth /= (WIDTH - 1) / power;
        boxHeight /= WIDTH - 1 >> 1;
        x = Math.floor(Math.random() * (WIDTH - power + 1));
    }else{
        // 負の攻撃力はその絶対値が盤面幅いっぱいのおじゃまの厚さを意味する
        text = document.createElement('div');
        Object.assign(text.style, {
            position:'absolute',
            left:`0px`,
            top:`0px`,
            width:`${BOX_WIDTH}px`,
            height:`${BOX_HEIGHT}px`,
            fontSize:`${BOX_HEIGHT * 0.75}px`,
            lineHeight: `${BOX_HEIGHT}px`,
            textAlign:'center',
            color: '#fff',
            webkitTextStroke:'1px #f00',
            textStroke:'1px #f00',
        });
        text.innerText = -power;
    }
    const box = document.createElement('div');
    Object.assign(box.style, {
        position:'absolute',
        left:`1px`,
        top:`${(BOX_HEIGHT - boxHeight) >> 1}px`,
        width:`${boxWidth}px`,
        height:`${boxHeight}px`,
        boxSizing: 'border-box',
        border: `outset ${BLOCK_SIZE / 15}px #888`,
        backgroundColor: '#888',
        borderRadius: `${BLOCK_SIZE / 15}px`,
    });
    stack.append(box);
    if(text)stack.append(text);
    // 攻撃オブジェクトを作成して返す
    let ready = ATTACK_READY_FRAME;
    let count = STACK_FRAME;
    return { countDown:function(ok){
        if(ready > 0){
            // 攻撃エフェクトが届くまではとりあえずフリーズしておく
            if(--ready == 0){
                stack.style.visibility = 'visible';
            }
        }
        // 所定フレーム以上待機したのちに盤面が落下可能状態になったら実行
        if(--count > 0 || !ok)return false;
        // おじゃまを発生させる高さを探す
        let landingPoint = -HEIGHT;
        for(let j = -HEIGHT;j < 0;++j){
            let line = true;
            for(let i = 0;i < WIDTH;++i){
                if(blocks[i + j * WIDTH].type >= 0){
                    line = false;
                    break;
                }
            }
            if(line)
                landingPoint = j + 1;
            else
                break;
        }
        // おじゃまが画面上部にスタックしすぎるとキャンセルされる
        if(landingPoint > -HEIGHT){
            const group = {
                width : power > 0 ? power : WIDTH,
                height : power > 0 ? 1 : -power,
            };
            let leader = true;
            for(let j = 0;j < group.height;++j){
                let y = j - group.height + landingPoint;
                for(let i = x;i < x + group.width;++i){
                    const b = blocks[i + y * WIDTH];
                    b.reset();
                    b.type = 6;
                    b.group = group;
                    b.leader = leader;
                    b.toughness = group.height - j;
                    leader = false;
                }
            }
            panelBounce = ATTACK_BOUNCE_FRAME;
            raiseCount -= raiseTime >> 3;   // おじゃまが落ちるとちょっとせり上がりが戻る
            if(raiseCount < 0)raiseCount = 0;
        }
        this.finalyze();
        return true;
    },
    finalyze:() => {
        // 後片付け
        stack.remove();
        stacks.childNodes.forEach((n, i) => n.style.left = `${i * BOX_WIDTH}px`);
    } };
};
// 攻撃を受けた
gameController.addEventListener('attack', e => {
    if(e.targetId == playerID){
        attacks.push(...e.power.map(createAttack));
    }
});

// 連結判定
const judge = (x, y, sameTimingComboID) => {
    const b = blocks[x+y*WIDTH];
    if(!b.isConnectable())return [0, 0];
    let combo = b.comboCount;
    let newComboID = b.comboID;
    const scan = (dx, dy) => {
        let num = 1;
        let sx = x + dx;
        let sy = y + dy;
        let maxCombo = 0;
        let maxID = -1;
        let freshBlock = 0;
        while(sx < WIDTH && sy < HEIGHT){
            const d = blocks[sx + sy * WIDTH];
            if(b.type != d.type || !d.isConnectable()){
                break;
            }
            num++;
            maxCombo = Math.max(maxCombo, d.comboCount);
            maxID = Math.max(maxID, d.comboID);
            sx += dx;
            sy += dy;
        }
        if(num >= 3){
            combo = Math.max(combo, maxCombo);
            newComboID = Math.max(newComboID, maxID);
            return num;
        }
        return 0;
    };
    const right = scan(1, 0);
    const down = scan(0, 1);
    let freshNum = 0;
    const newCombo = right + down && newComboID < 0;
    if(newCombo)newComboID = sameTimingComboID >= 0 ? sameTimingComboID : comboID++;   // 新規のコンボ（1連鎖目）には新たなコンボIDを割り振る
    for(let i = x;i < x + right;++i){
        const b = blocks[i+y*WIDTH];
        freshNum += b.state == NEUTRAL;
        b.setState(EXTINCT);
        b.comboCount = combo;
        b.comboID = newComboID;
    }
    for(let i = y;i < y + down;++i){
        const b = blocks[x+i*WIDTH];
        freshNum += b.state == NEUTRAL;
        b.setState(EXTINCT);
        b.comboCount = combo;
        b.comboID = newComboID;
    }
    return [right + down > 0, combo, newComboID, freshNum, newCombo];
};

const updateFunc = () => {
    player.update();
    let stopRaise = false;
    // お邪魔グループを避けつつ正しい順序で全ブロックをトラバースする関数
    const traverseSafety = (ox, oy, ex, ey, func) => {
        for(let x = ox;x < ex;++x){
            for(let y = oy;y > ey;--y){
                let b = blocks[x+y*WIDTH];
                if(b.group){
                    const group = b.group;
                    // グループの下領域を処理
                    traverseSafety(x + 1, oy, ex, y, func);
                    // グループを処理
                    let groupLanding = false;
                    let actualLanding = false;
                    const falling = b.state == FALLING;
                    for(let gx = x;gx < x + group.width;++gx){
                        if(func(gx, y) == NEUTRAL){
                            groupLanding = true;// 1つでも着地したブロックが合ったらグループ全部着地扱い
                            actualLanding = actualLanding || blocks[gx + y * WIDTH].landing;
                        }
                        for(let gy = y - 1;gy > y - group.height;--gy)func(gx, gy);
                    }
                    // 1つでも着地していたら強制的にグループの全ブロックを着地状態に
                    if(groupLanding){
                        for(let gx = x;gx < x + group.width;++gx){
                            for(let gy = y;gy > y - group.height;--gy){
                                const b = blocks[gx + (gy + falling) * WIDTH];
                                b.setState(NEUTRAL);
                                b.landing = actualLanding;
                                b.bounceCount = BOUNCE_FRAME * falling;
                            }
                        }
                    }
                    // グループの右領域を処理
                    traverseSafety(x + group.width, y, ex, y - group.height, func);
                    // グループの上領域を処理
                    traverseSafety(x, y - group.height, ex, ey, func);
                    return;
                }
                func(x, y);
            }
        }
    };

    // 更新
    const vanishTest = [];
    traverseSafety(0, HEIGHT - 1, WIDTH, -1 - HEIGHT, (x, y) => {
        let b = blocks[x + y * WIDTH];
        const prevState = b.state;
        b.update();
        let fallCheck = HEIGHT;
        if(b.state == MOVEDOWN){
            b.setState(NEUTRAL);
            let d = blocks[x+(y+1)*WIDTH];
            Object.assign(d, b);
            b.reset();
            b = d;
            fallCheck = y + 2;
        }else
        if(b.state == SWAPPED){
            let o = blocks[x+1+y*WIDTH];
            b.setState(REVITATE);
            o.setState(REVITATE);
            blocks[x+1+y*WIDTH] = b;
            blocks[x+y*WIDTH] = b = o;
        }else
        if(b.state == CHECK_FLOOR){
            b.setState(NEUTRAL);
            fallCheck = y + 1;
        }else
        if(b.isExplosion()){
            if(y >= 0){
                let raiseY = Math.floor(BLOCK_SIZE * raiseCount / raiseTime);
                explosion(effectLayer, (x + 0.5) * BLOCK_SIZE, (y + 0.5) * BLOCK_SIZE - raiseY);
            }
        }else
        if(b.type >= 0 && b.state == NEUTRAL){
            fallCheck = y + 1;
        }
        if(b.isUnzipped()){
            // ダメージを受けてグループのサイズ（高さ）も減る
            if(b.leader){
                b.group.height = b.toughness;
            }
            if(b.toughness <= 0){
                // 右と下に対して発火しない色を選択
                let color;
                do{
                    color = Math.floor(Math.random() * 6);
                }while((x < WIDTH - 2 && color == blocks[x + 1 + y * WIDTH].type && color == blocks[x + 2 + y * WIDTH].type) ||
                    (y < HEIGHT - 2 && color == blocks[x + (y + 1) * WIDTH].type && color == blocks[x + (y + 2) * WIDTH].type));
                b.type = color;
                b.leader = false;
                b.group = null;
            }
        }
        if(b.state == VANISH || prevState == VANISH && b.state == NEUTRAL){
            vanishTest[x+y*WIDTH] = {comboCount:b.comboCount + 1, comboID:b.comboID};
        }
        if(b.state == REVITATE){
            let d = blocks[x+(y+1)*WIDTH];
            if(!d || !d.isVacancy())b.setState(NEUTRAL);
        }
        if(fallCheck < HEIGHT){
            let d = blocks[x+fallCheck*WIDTH];
            if(d.isVacancy()) {
                b.setState(FALLING);
                b.landing = false;
                if(prevState != FALLING){
                    // 連鎖情報を伝える
                    let chainSource = vanishTest[x+fallCheck*WIDTH];
                    if(chainSource) {
                        Object.assign(b, chainSource);
                    }else{
                        b.comboCount = d.comboCount;
                        b.comboID = d.comboID;
                    }                        
                }
            }else{
                b.landing = d.landing;
            }
        }else{
            fallCheck = y + 1;
            if(fallCheck < HEIGHT){
                let d = blocks[x+fallCheck*WIDTH];
                b.landing = d.isScaffolding();
            }else{
                b.landing = true;
            }
        }
        stopRaise |= b.state == EXTINCT || b.state == VANISH || b.state == UNZIP;
        return b.state;
    });
    // 消滅判定
    let comboResults;
    let newComboID = -1;
    for(let x = 0;x < WIDTH;++x){
        for(let y = 0;y < HEIGHT;++y){
            const [success, combo, comboID, num, newCombo] = judge(x, y, newComboID);
            if(!success)continue;
            // 複数個所での消滅であっても起点が同じ消滅の場合はそれらの総数で同時消し計算を行うので
            // いったん消滅リストへ登録して次のステップで計算する
            comboResults = comboResults || {};
            let result = comboResults[comboID];
            if(result){
                result.num += num;
                if(result.combo != combo)debugger;
            }else{
                result = {
                    x : x,
                    y : y,
                    num : num,
                    combo : combo
                };
                comboResults[comboID] = result;
            }
            if(newCombo)newComboID = comboID;
        }
    }
    // 消滅処理
    if(comboResults){
        let raiseY = Math.floor(BLOCK_SIZE * raiseCount / raiseTime);
        let vanishNum = 0;
        for(let id in comboResults){
            if(id === undefined)continue;
            const result = comboResults[id];
            vanishNum += result.num;
            score += CONNECT_BONUS[Math.min(result.num, CONNECT_BONUS.length - 1)];
            score += COMBO_POINT[Math.min(result.combo, COMBO_POINT.length - 1)];
            const attack = calcConnectAttack(result.num);
            if(result.combo){
                comboBonus(effectLayer, result.x * BLOCK_SIZE, result.y * BLOCK_SIZE - raiseY, result.combo + 1);
                attack.push(...Array(result.combo).fill(WIDTH));
            }
            if(attack.length){
                const mergedAttack = attack.filter(v => v != WIDTH);
                const maxAttackNum = attack.length - mergedAttack.length;
                if(maxAttackNum > 0)mergedAttack.push(-maxAttackNum);
                gameController.attack(effectLayer, playerID, mergedAttack, (result.x + 0.5) * BLOCK_SIZE, (result.y + 0.5) * BLOCK_SIZE - raiseY);
            }
            --raiseTime;
        }
        const unzipCheck = (x, y, comboID, comboCount) => {
            if(x >= 0 && x < WIDTH && y >= -HEIGHT && y < HEIGHT){
                const b = blocks[x + y * WIDTH];
                if(b.state == NEUTRAL && b.group){
                    b.setState(UNZIP);
                    b.toughness--;
                    if(b.comboID < 0 || b.comboCount < comboCount){
                        b.comboCount = comboCount;
                        b.comboID = comboID;
                    }
                    return 1
                    + unzipCheck(x + 1, y, comboID, comboCount)
                    + unzipCheck(x, y + 1, comboID, comboCount)
                    + unzipCheck(x - 1, y, comboID, comboCount)
                    + unzipCheck(x, y - 1, comboID, comboCount);
                }
            }
            return 0;
        };
        let unzipNum = 0;
        let vanishIndex = 0;
        for(let y = 0;y < HEIGHT;++y){
            for(let x = 0;x < WIDTH;++x){
                const b = blocks[x + y * WIDTH];
                if(b.state == EXTINCT && b.count == 0){
                    // 左上から順に消えていくようディレイ値を設定
                    b.vanishIndex = vanishIndex++;
                    b.vanishNum = vanishNum;
                    // 隣接したおじゃまを解凍モードへ
                    unzipNum += unzipCheck(x + 1, y, b.comboID, b.comboCount)
                                + unzipCheck(x, y + 1, b.comboID, b.comboCount)
                                + unzipCheck(x - 1, y, b.comboID, b.comboCount)
                                + unzipCheck(x, y - 1, b.comboID, b.comboCount);
                }
            }
        }
        let unzipIndex = unzipNum;
        for(let i = -NUM;i < NUM;++i){
            let b = blocks[i];
            if(b.state == UNZIP && b.count == 0){
                // 右下から解凍されていく
                b.vanishIndex = --unzipIndex;
                b.vanishNum = unzipNum;
            }
        }
        stopRaise = true;
        showScore?.call();
    }
    if(raiseTime < 40)raiseTime = 40;

    // 移動
    if(player.moveUp) {
        if(y > 1)y--;
    }else
    if(player.moveDown) {
        if(y < HEIGHT - 1)y++;
    }else
    if(player.moveRight) {
        if(x < WIDTH - 2)x++;
    }else
    if(player.moveLeft) {
        if(x > 0)x--;
    }
    // 入れ替え
    if(player.swap){
        const l = blocks[x + y * WIDTH];
        const r = blocks[x + 1 + y * WIDTH];
        let swappable = l.isSwappable() && r.isSwappable();
        if(swappable){
            const ul = blocks[x + (y - 1) * WIDTH];
            const ur = blocks[x + 1 + (y - 1) * WIDTH];
            swappable = ul.state != FALLING && ur.state != FALLING;
        }
        if(swappable){
            l.setState(SWAPPING_L);
            r.setState(SWAPPING_R);
        }
    }
    // せり上がり
    let pump = 1;
    if(player.haste){
        raiseCount += 20;
    }else
    if(!stopRaise){
        raiseCount += pump;
    }
    if(raiseCount >= raiseTime){
        raiseCount = 0;
        let failed = false;
        for(let x = 0;x < WIDTH;++x){
            // 最上段まで埋まってしまった
            failed |= blocks[x + WIDTH].isOverflow();

            let b = blocks[x - NUM];
            b.reset();
            b.type = next[x];
            b.setState(NEUTRAL);
            for(let y = HEIGHT;y-- > -HEIGHT;){
                let n = blocks[x + y * WIDTH];
                blocks[x + y * WIDTH] = b;
                b = n;
            }
        }
        genNext();
        if(y > 1)y--;
        if(failed && !INVINCIBLE){
            gameController.gameOver(playerID);
        }
    }
    // 攻撃
    for(let i = 0;i < attacks.length;){
        const a = attacks[i];
        if(a.countDown(!stopRaise)){
            attacks.splice(i, 1);
        }else{
            ++i;
        }
    }

    counter++;

    // 指定座標を中心に文字列を描画
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.font = `${BLOCK_SIZE*0.8}px メイリオ`;
    let raiseY = Math.floor(BLOCK_SIZE * raiseCount / raiseTime);
    if(panelBounce){
        raiseY -= easeBounce(1 - --panelBounce / ATTACK_BOUNCE_FRAME) * BLOCK_SIZE * 0.2;
    }
    // ブロック
    const FRAME_WIDTH = BLOCK_SIZE / 16;
    const drawBlock = (b, w, h) => {
        const scale = b.scale();
        const BEVEL = FRAME_WIDTH * 3;

        // お邪魔ブロックの特別な描画
        if(b.type == 6){
            // 石のベースグラデーション（より3D的に）
            const stoneGradient = g.createRadialGradient(w * 0.3, h * 0.3, 0, w * 0.5, h * 0.5, w * 0.8);
            stoneGradient.addColorStop(0, '#bbb');
            stoneGradient.addColorStop(0.3, '#999');
            stoneGradient.addColorStop(0.6, '#777');
            stoneGradient.addColorStop(1, '#555');
            g.fillStyle = stoneGradient;
            g.fillRect(0, 0, w, h);

            // 固定パターンのノイズテクスチャ（ちらつき防止）
            const seed = (b.x || 0) + (b.y || 0) * 7; // ブロック位置ベースのシード
            for(let i = 0; i < 20; i++){
                const px = ((seed * 17 + i * 13) % 100) / 100 * w;
                const py = ((seed * 23 + i * 19) % 100) / 100 * h;
                const shade = ((seed + i * 7) % 50) + 50;
                g.fillStyle = `rgba(${shade}, ${shade}, ${shade}, 0.15)`;
                g.fillRect(px, py, 2, 2);
            }

            // 固定パターンのひび割れ（ちらつき防止）
            g.strokeStyle = 'rgba(0, 0, 0, 0.4)';
            g.lineWidth = 1.5;
            g.beginPath();
            for(let i = 0; i < 5; i++){
                const startX = ((seed * 31 + i * 41) % 100) / 100 * w;
                const startY = ((seed * 37 + i * 43) % 100) / 100 * h;
                g.moveTo(startX, startY);
                for(let j = 0; j < 2; j++){
                    const dx = (((seed + i + j) * 17) % 100 - 50) / 100 * w * 0.2;
                    const dy = (((seed + i + j) * 19) % 100 - 50) / 100 * h * 0.2;
                    g.lineTo(startX + dx, startY + dy);
                }
            }
            g.stroke();

            // 3Dベベル効果
            g.fillStyle = 'rgba(255, 255, 255, 0.2)';
            g.fillRect(0, 0, w, BEVEL);
            g.fillRect(0, 0, BEVEL, h);

            g.fillStyle = 'rgba(0, 0, 0, 0.4)';
            g.fillRect(0, h - BEVEL, w, BEVEL);
            g.fillRect(w - BEVEL, 0, BEVEL, h);
        }else{
            // 3Dプラスチック/ガラスブロック
            const baseColor = COLORS[b.type];
            const lightColor = LIGHT_COLORS[b.type];
            const darkColor = DARK_COLORS[b.type];

            // ベースの放射状グラデーション
            const radialGrad = g.createRadialGradient(w * 0.35, h * 0.35, w * 0.1, w * 0.5, h * 0.5, w * 0.8);
            radialGrad.addColorStop(0, lightColor);
            radialGrad.addColorStop(0.4, baseColor);
            radialGrad.addColorStop(0.8, baseColor);
            radialGrad.addColorStop(1, darkColor);
            g.fillStyle = radialGrad;
            g.fillRect(0, 0, w, h);

            // 上部の強い光沢（ガラス風）
            const gloss = g.createLinearGradient(0, 0, 0, h * 0.5);
            gloss.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
            gloss.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
            gloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
            g.fillStyle = gloss;
            g.fillRect(BEVEL, BEVEL, w - BEVEL * 2, h * 0.4);

            // ベベルエッジ（立体感）
            // 上辺
            const topBevel = g.createLinearGradient(0, 0, 0, BEVEL);
            topBevel.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
            topBevel.addColorStop(1, 'rgba(255, 255, 255, 0)');
            g.fillStyle = topBevel;
            g.fillRect(0, 0, w, BEVEL);

            // 左辺
            const leftBevel = g.createLinearGradient(0, 0, BEVEL, 0);
            leftBevel.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
            leftBevel.addColorStop(1, 'rgba(255, 255, 255, 0)');
            g.fillStyle = leftBevel;
            g.fillRect(0, 0, BEVEL, h);

            // 下辺
            const bottomBevel = g.createLinearGradient(0, h - BEVEL, 0, h);
            bottomBevel.addColorStop(0, 'rgba(0, 0, 0, 0)');
            bottomBevel.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
            g.fillStyle = bottomBevel;
            g.fillRect(0, h - BEVEL, w, BEVEL);

            // 右辺
            const rightBevel = g.createLinearGradient(w - BEVEL, 0, w, 0);
            rightBevel.addColorStop(0, 'rgba(0, 0, 0, 0)');
            rightBevel.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
            g.fillStyle = rightBevel;
            g.fillRect(w - BEVEL, 0, BEVEL, h);

            // 内側の柔らかい影
            g.fillStyle = 'rgba(0, 0, 0, 0.15)';
            g.fillRect(w - BEVEL * 1.5, BEVEL, BEVEL * 0.5, h - BEVEL * 2);
            g.fillRect(BEVEL, h - BEVEL * 1.5, w - BEVEL * 2, BEVEL * 0.5);

            // 反射光（右上）
            const reflection = g.createRadialGradient(w * 0.75, h * 0.25, 0, w * 0.75, h * 0.25, w * 0.3);
            reflection.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
            reflection.addColorStop(1, 'rgba(255, 255, 255, 0)');
            g.fillStyle = reflection;
            g.fillRect(w * 0.5, 0, w * 0.5, h * 0.5);

            // 外枠（微細なアウトライン）
            g.strokeStyle = darkColor;
            g.lineWidth = 1;
            g.strokeRect(0.5, 0.5, w - 1, h - 1);
        }

        // マーク描画
        const text = RELIEF[b.type];
        const tm = g.measureText(text);

        // マークの影
        g.fillStyle = 'rgba(0, 0, 0, 0.3)';
        g.translate(0.5 * w + 2, 0.5 * h + 2);
        g.scale(scale, scale);
        g.translate(-0.5 * tm.width, 0.5 * tm.actualBoundingBoxAscent + b.offsetReliefY());
        g.fillText(text, 0, 0);
        g.resetTransform();

        // マーク本体
        g.fillStyle = '#fff';
        g.translate(0.5 * w, 0.5 * h);
        g.scale(scale, scale);
        g.translate(-0.5 * tm.width, 0.5 * tm.actualBoundingBoxAscent + b.offsetReliefY());
        g.fillText(text, 0, 0);
        g.resetTransform();
    };
    for(let x = 0;x < WIDTH;++x){
        for(let y = -HEIGHT;y < HEIGHT;++y){
            const b = blocks[x+y*WIDTH];
            if(b.leader && b.toughness){
                g.translate(x * BLOCK_SIZE + b.offsetX(), y * BLOCK_SIZE + b.offsetY() - raiseY);
                drawBlock(b, b.group.width * BLOCK_SIZE, b.toughness * BLOCK_SIZE);
                g.resetTransform();
            }
            if(b.isVisible()) {
                g.translate(x * BLOCK_SIZE + b.offsetX(), y * BLOCK_SIZE + b.offsetY() - raiseY);
                drawBlock(b, BLOCK_SIZE, BLOCK_SIZE);
                g.resetTransform();
            }
        }
        // 予告ブロック
        g.fillStyle = DARK_COLORS[next[x]];
        g.fillRect(x*BLOCK_SIZE,HEIGHT*BLOCK_SIZE-raiseY,BLOCK_SIZE,BLOCK_SIZE);
    }
    // カーソル
    g.translate((x+0.5)*BLOCK_SIZE, (y+0.5)*BLOCK_SIZE-raiseY);

    // 滑らかな拡大縮小アニメーション
    const cursorPulse = Math.sin(counter * 0.15) * 0.15 + 1;
    const cursorGlow = Math.abs(Math.sin(counter * 0.1)) * 0.5 + 0.5;

    // カーソルの影
    g.fillStyle = 'rgba(0, 0, 0, 0.3)';
    g.beginPath();
    const shadowOffset = -(BLOCK_SIZE * 0.5 + 3);
    g.scale(cursorPulse * 1.05, cursorPulse * 1.05);
    for(let i = 0; i < 2; i++){
        for(let j = 0; j < 4; j++){
            g.rotate(0.5 * Math.PI);
            g.rect(shadowOffset, shadowOffset, BLOCK_SIZE / 3, BLOCK_SIZE / 8);
            g.rect(shadowOffset, shadowOffset, BLOCK_SIZE / 8, BLOCK_SIZE / 3);
        }
        g.translate(BLOCK_SIZE, 0);
    }
    g.fill();
    g.resetTransform();

    // カーソル本体
    g.translate((x+0.5)*BLOCK_SIZE, (y+0.5)*BLOCK_SIZE-raiseY);
    g.scale(cursorPulse, cursorPulse);

    // 外側の光
    g.strokeStyle = `rgba(255, 255, 100, ${cursorGlow * 0.6})`;
    g.lineWidth = 4;
    g.beginPath();
    const offset = -(BLOCK_SIZE * 0.5);
    for(let i = 0; i < 2; i++){
        for(let j = 0; j < 4; j++){
            g.rotate(0.5 * Math.PI);
            g.rect(offset, offset, BLOCK_SIZE / 3, BLOCK_SIZE / 8);
            g.rect(offset, offset, BLOCK_SIZE / 8, BLOCK_SIZE / 3);
        }
        g.translate(BLOCK_SIZE, 0);
    }
    g.stroke();
    g.resetTransform();

    // カーソルメイン
    g.translate((x+0.5)*BLOCK_SIZE, (y+0.5)*BLOCK_SIZE-raiseY);
    g.scale(cursorPulse, cursorPulse);
    g.fillStyle = 'white';
    g.beginPath();
    for(let i = 0; i < 2; i++){
        for(let j = 0; j < 4; j++){
            g.rotate(0.5 * Math.PI);
            g.rect(offset, offset, BLOCK_SIZE / 3, BLOCK_SIZE / 8);
            g.rect(offset, offset, BLOCK_SIZE / 8, BLOCK_SIZE / 3);
        }
        g.translate(BLOCK_SIZE, 0);
    }
    g.fill();
    g.resetTransform();

    // 内側のハイライト
    g.translate((x+0.5)*BLOCK_SIZE, (y+0.5)*BLOCK_SIZE-raiseY);
    g.scale(cursorPulse, cursorPulse);
    g.fillStyle = `rgba(255, 255, 255, ${cursorGlow * 0.8})`;
    g.beginPath();
    for(let i = 0; i < 2; i++){
        for(let j = 0; j < 4; j++){
            g.rotate(0.5 * Math.PI);
            g.rect(offset + 2, offset + 2, BLOCK_SIZE / 3 - 4, BLOCK_SIZE / 8 - 4);
            g.rect(offset + 2, offset + 2, BLOCK_SIZE / 8 - 4, BLOCK_SIZE / 3 - 4);
        }
        g.translate(BLOCK_SIZE, 0);
    }
    g.fill();
    g.resetTransform();
};

resetGame();
}

class GameController extends EventTarget {
    constructor(){
        super();
        this.players = [];
        this.standby = false;
        let timerID;
        const update = () => {
            const e = new Event('frame');
            this.dispatchEvent(e);

            // エフェクト更新
            for(let i = 0;i < effects.length;) {
                const e = effects[i];
                if(e.update()){
                    e.finalyzer();
                    effects.splice(i, 1);
                }else{
                    ++i;
                }
            }

            let end = false;
            let survivor = this.players.length;
            if(survivor > 1){
                for(let p of this.players)if(p.over)survivor--;
                if(survivor <= 1){
                    // 勝者と引き分けイベント発行
                    const e = new Event('settle');
                    if(survivor == 1){
                        e.winner = this.players.findIndex(p => !p.over);
                    }else{
                        e.draw = this.players.map((p, id) => p.over != 1 ? -1 : (p.over = 2, id)).filter(i => i >= 0);
                    }
                    this.dispatchEvent(e);
                    end = true;
                }
                this.players.forEach((p, id) => {
                    // 敗北イベント
                    if(p.over == 1){
                        const e = new Event('settle');
                        e.lose = id;
                        this.dispatchEvent(e);
                        p.over = 2;
                    }
                });
            }else if(survivor == 1){
                // とことんでゲームオーバー
                if(this.players[0].over){
                    const e = new Event('settle');
                    e.gameOver = 0;
                    this.dispatchEvent(e);
                    end = true;
                }
            }
            if(end){
                clearInterval(timerID);
                setTimeout(() => {
                    this.restart();
                    timerID = setInterval(update, 16);
                }, 1500);
                for(let e of effects)e.finalyzer();
                effects.length = 0;
            }
        };
        timerID = setInterval(update, 16);
    }
    gameOver(id){
        this.players[id].over = 1;
    }
    attack(effectLayer, id, power, x, y){
        const rivals = this.players.filter((p, _id) => p.over == 0 && _id != id);
        if(rivals.length == 0)return;
        const targetId = Math.floor(Math.random() * rivals.length);
        const transformAttacker = this.players[id].transform;
        const transformTarget = rivals[targetId].transform;
        attackEffect(effectLayer,
            x, y, BLOCK_SIZE / 6,
            ((transformTarget.x + WIDTH * BLOCK_SIZE * transformTarget.scale * 0.5) - transformAttacker.x) / transformAttacker.scale,
            ((transformTarget.y - BLOCK_SIZE * transformTarget.scale) - transformAttacker.y) / transformAttacker.scale,
            BLOCK_SIZE / 2 * transformTarget.scale / transformAttacker.scale);
        const e = new Event('attack');
        e.targetId = this.players.indexOf(rivals[targetId]);
        e.power = power;
        this.dispatchEvent(e);
    }
    restart(){
        for(let p of this.players)p.over = 0;
        const e = new Event('reset');
        this.dispatchEvent(e);
    }
    doLayout(){
        const marginTop = 28;
        const w = document.body.clientWidth;
        const h = document.body.clientHeight - marginTop;
        const panelWidth = WIDTH * BLOCK_SIZE + BORDER_WIDTH * 2;
        const panelHeight = HEIGHT * BLOCK_SIZE + BORDER_WIDTH * 2;
        const num = this.players.length;
        const scale = Math.min(w / (num * (panelWidth + BLOCK_SIZE * 3)), h / (panelHeight + BLOCK_SIZE * 3));
        const marginHor = Math.max(w / num - panelWidth * scale, 0) * 0.5;
        const marginVer = Math.max(h - panelHeight * scale, 0) * 0.5 + marginTop;
        let e = new UIEvent('resize');
        for(let i = 0;i < num;++i){
            Object.assign(this.players[i].element.style, {
                position:'absolute',
                left:`${w * i / num + marginHor}px`,
                top:`${marginVer}px`,
                width:`${panelWidth}px`,
                height:`${panelHeight}px`,
                transform:`scale(${scale})`,
                transformOrigin: 'top left'
            });
            this.players[i].element.dispatchEvent(e);
            this.players[i].transform = {x : w * i / num + marginHor + BORDER_WIDTH * scale, y : marginVer + BORDER_WIDTH * scale, scale : scale};
        }
    }
    addPlayer(player, type, options){
        Game(this, this.players.length, player, type, options);
        this.players.push({element:player, over:0});
    }
}

    startMenu.style.visibility = 'hidden';
    gamePanel.style.visibility = 'visible';
    const controller = new GameController();
    for(let i = 0;i < gameOptions.length;++i){
        const opt = gameOptions[i];
        if(opt.none.checked)continue;
        const player = document.createElement('div');
        document.body.append(player);
        controller.addPlayer(player, opt.player.checked ? HUMAN : MACHINE, {wait:opt.level.value * 8, aggressivity:opt.level.value < 2 ? 4 : 3});
    }

    document.body.onresize = controller.doLayout.bind(controller);
    controller.doLayout();

// 背景パーティクル生成
(function(){
    const bgParticles = document.getElementById('bg-particles');
    const particleCount = 25;

    for(let i = 0; i < particleCount; i++){
        const particle = document.createElement('div');
        particle.classList.add('bg-particle');

        const size = 3 + Math.random() * 8;
        const x = Math.random() * 100;
        const y = Math.random() * 100;
        const delay = Math.random() * 20;
        const duration = 15 + Math.random() * 15;

        Object.assign(particle.style, {
            width: `${size}px`,
            height: `${size}px`,
            left: `${x}%`,
            top: `${y}%`,
            animationDelay: `${delay}s`,
            animationDuration: `${duration}s`,
        });

        bgParticles.append(particle);
    }
})();

// リプレイコントロールのイベントハンドラー
(function(){
    const recordBtn = document.getElementById('replay-record');
    const stopBtn = document.getElementById('replay-stop');
    const playBtn = document.getElementById('replay-play');
    const saveBtn = document.getElementById('replay-save');
    const loadBtn = document.getElementById('replay-load');
    const fileInput = document.getElementById('replay-file');

    recordBtn.addEventListener('click', () => {
        replayManager.startRecording();
        alert('リプレイ記録を開始しました');
    });

    stopBtn.addEventListener('click', () => {
        replayManager.stopRecording();
        replayManager.stopPlayback();
        alert('リプレイ記録を停止しました');
    });

    playBtn.addEventListener('click', () => {
        replayManager.startPlayback();
        alert('リプレイを再生します');
    });

    saveBtn.addEventListener('click', () => {
        const data = replayManager.save();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `replay_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        alert('リプレイを保存しました');
    });

    loadBtn.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if(file){
            const reader = new FileReader();
            reader.onload = (event) => {
                if(replayManager.load(event.target.result)){
                    alert('リプレイを読み込みました');
                }else{
                    alert('リプレイの読み込みに失敗しました');
                }
            };
            reader.readAsText(file);
        }
    });
})();