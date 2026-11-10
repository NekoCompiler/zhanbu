/*
 * 梅花易数 · 玄机排盘  —— 纯前端核心
 * 无任何依赖，浏览器 / Node 均可加载（Node 下可用于自检）。
 *
 * 体系：先天八卦数 · 时间起卦 · 体用生克 · 阴阳五行 · 洛书九宫地气
 *      · 干支四柱 · 大运流年 · 事由爻动 · 黄道十二神应期
 */
(function () {
  'use strict';

  var root = typeof globalThis !== 'undefined' ? globalThis : this;
  var API = {};

  /* ============================ 基础工具 ============================ */
  function mod(n, m) { return ((n % m) + m) % m; }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function hash(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return h >>> 0;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  var ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  var ZHI_HOUR = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  var HOUR_RANGE = ['23:00–01:00', '01:00–03:00', '03:00–05:00', '05:00–07:00',
    '07:00–09:00', '09:00–11:00', '11:00–13:00', '13:00–15:00',
    '15:00–17:00', '17:00–19:00', '19:00–21:00', '21:00–23:00'];
  var GAN_WX = ['木', '木', '火', '火', '土', '土', '金', '金', '水', '水'];
  var ZHI_WX = ['水', '土', '木', '木', '土', '火', '火', '土', '金', '金', '土', '水'];

  /* 五行：相生循环 木→火→土→金→水→木；相克 木→土→水→火→金→木 */
  var SHENG = { '木': '火', '火': '土', '土': '金', '金': '水', '水': '木' };
  var KE = { '木': '土', '土': '水', '水': '火', '火': '金', '金': '木' };
  function sheng(a, b) { return SHENG[a] === b; }
  function ke(a, b) { return KE[a] === b; }

  /* ============================ 干支历 ============================ */
  var DAY_ANCHOR = Math.floor(Date.UTC(1984, 1, 2) / 86400000); // 甲子日锚点
  function dayNumber(d) { return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000); }
  function gzIndex(n) { return mod(n, 60); }
  function gz(n) { var i = gzIndex(n); return GAN[mod(i, 10)] + ZHI[mod(i, 12)]; }

  function yearGZ(d) {
    // 立春前（公历 2/4 近似）仍属上一年气
    var y = d.getFullYear() - ((d.getMonth() + 1 < 2 || (d.getMonth() + 1 === 2 && d.getDate() < 4)) ? 1 : 0);
    return { gan: mod(y - 4, 10), zhi: mod(y - 4, 12), text: GAN[mod(y - 4, 10)] + ZHI[mod(y - 4, 12)] };
  }
  function monthGZ(d, yearGan) {
    var m = d.getMonth() + 1;
    if (d.getDate() < 6) m -= 1;               // 交节近似
    var zhi = mod(m, 12);                       // 2月寅 … 12月子 … 1月丑
    var base = [2, 4, 6, 8, 0][mod(yearGan, 5)]; // 甲己丙作首 …
    var n = mod(zhi - 2, 12);
    return { gan: mod(base + n, 10), zhi: zhi, text: GAN[mod(base + n, 10)] + ZHI[zhi] };
  }
  function dayGZ(d) {
    var i = gzIndex(dayNumber(d) - DAY_ANCHOR);
    return { idx: i, gan: mod(i, 10), zhi: mod(i, 12), text: gz(i) };
  }
  function hourZhiIndex(d) { return Math.floor((d.getHours() + 1) / 2) % 12; }
  function hourGZ(d, dayGan) {
    var z = hourZhiIndex(d);
    var base = [0, 2, 4, 6, 8][mod(dayGan, 5)]; // 甲己还加甲 …
    return { gan: mod(base + z, 10), zhi: z, text: GAN[mod(base + z, 10)] + ZHI[z] };
  }
  function fourPillars(d) {
    var y = yearGZ(d), m = monthGZ(d, y.gan), dd = dayGZ(d), h = hourGZ(d, dd.gan);
    return { year: y.text, month: m.text, day: dd.text, hour: h.text, dayGZ: dd, yearGZ: y, hourZhi: h.zhi };
  }

  /* 农历（浏览器 / Node 的 ICU 中文农历），失败时给出干支历兜底 */
  var CN_DAY = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
    '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
    '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];
  function lunarText(d) {
    try {
      var f = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { year: 'numeric', month: 'long', day: 'numeric' });
      var parts = f.formatToParts(d);
      function pick(t) { for (var i = 0; i < parts.length; i++) if (parts[i].type === t) return parts[i].value; return ''; }
      var month = pick('month'), yearName = pick('yearName'), num = parseInt(pick('day'), 10);
      if (month && num >= 1) {
        return (yearName ? yearName + '年 ' : '') + month + (CN_DAY[num - 1] || (num + '日'));
      }
    } catch (e) { /* 兜底 */ }
    return ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'][mod(d.getMonth(), 12)]
      + '月' + (CN_DAY[d.getDate() - 1] || (d.getDate() + '日'));
  }
  function solarText(d) {
    var wk = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日（星期' + wk + '）';
  }

  /* ============================ 八卦 / 六十四卦 ============================ */
  // 先天卦数：乾1 兑2 离3 震4 巽5 坎6 艮7 坤8；三爻自下而上
  var GUA_NAME = { 1: '乾', 2: '兑', 3: '离', 4: '震', 5: '巽', 6: '坎', 7: '艮', 8: '坤' };
  var GUA_SYMBOL = { 1: '☰', 2: '☱', 3: '☲', 4: '☳', 5: '☴', 6: '☵', 7: '☶', 8: '☷' };
  var GUA_WX = { 1: '金', 2: '金', 3: '火', 4: '木', 5: '木', 6: '水', 7: '土', 8: '土' };
  var GUA_BITS = {
    1: [1, 1, 1], 2: [1, 1, 0], 3: [1, 0, 1], 4: [1, 0, 0],
    5: [0, 1, 1], 6: [0, 1, 0], 7: [0, 0, 1], 8: [0, 0, 0]
  };
  var BITS_GUA = {};
  Object.keys(GUA_BITS).forEach(function (k) { BITS_GUA[GUA_BITS[k].join('')] = +k; });

  // 64 卦名：[上卦][下卦]
  var GUA64 = {
    1: ['乾为天', '天泽履', '天火同人', '天雷无妄', '天风姤', '天水讼', '天山遁', '天地否'],
    2: ['泽天夬', '兑为泽', '泽火革', '泽雷随', '泽风大过', '泽水困', '泽山咸', '泽地萃'],
    3: ['火天大有', '火泽睽', '离为火', '火雷噬嗑', '火风鼎', '火水未济', '火山旅', '火地晋'],
    4: ['雷天大壮', '雷泽归妹', '雷火丰', '震为雷', '雷风恒', '雷水解', '雷山小过', '雷地豫'],
    5: ['风天小畜', '风泽中孚', '风火家人', '风雷益', '巽为风', '风水涣', '风山渐', '风地观'],
    6: ['水天需', '水泽节', '水火既济', '水雷屯', '水风井', '坎为水', '水山蹇', '水地比'],
    7: ['山天大畜', '山泽损', '山火贲', '山雷颐', '山风蛊', '山水蒙', '艮为山', '山地剥'],
    8: ['地天泰', '地泽临', '地火明夷', '地雷复', '地风升', '地水师', '地山谦', '坤为地']
  };
  function gua64Name(up, down) { return GUA64[up][down - 1]; }

  /* ============================ 洛书九宫地气 ============================ */
  // 以中原（洛阳）为中宫，按方位归八卦九宫
  var GONG_NAME = { 1: '坎·北', 2: '坤·西南', 3: '震·东', 4: '巽·东南', 5: '中宫', 6: '乾·西北', 7: '兑·西', 8: '艮·东北', 9: '离·南' };
  var GONG_WX = { 1: '水', 2: '土', 3: '木', 4: '木', 5: '土', 6: '金', 7: '金', 8: '土', 9: '火' };
  var CENTER = { lng: 112.5, lat: 34.6 };
  function palaceOf(lng, lat) {
    var dx = (lng - CENTER.lng) * Math.cos(lat * Math.PI / 180);
    var dy = lat - CENTER.lat;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 2.2) return 5;
    var ang = Math.atan2(dx, dy) * 180 / Math.PI; // 北=0，顺时针
    if (ang < 0) ang += 360;
    var order = [1, 8, 3, 4, 9, 2, 7, 6]; // 北、东北、东、东南、南、西南、西、西北
    return order[Math.floor((ang + 22.5) / 45) % 8];
  }
  function cityLL(provinceLL, cityIndex, cityCount) {
    // 同城不同市以确定性微扰分气，不越省域
    var a = (cityIndex + 1) * 2.399963;
    var r = 0.35 + 1.15 * Math.sqrt((cityIndex + 1) / Math.max(cityCount, 1));
    return { lng: provinceLL[0] + r * Math.cos(a), lat: provinceLL[1] + r * Math.sin(a) * 0.72 };
  }

  /* ============================ 姓名数理 / 年龄 ============================ */
  function ageOf(birthday, now) {
    var a = now.getFullYear() - birthday.getFullYear();
    if (now.getMonth() < birthday.getMonth() ||
      (now.getMonth() === birthday.getMonth() && now.getDate() < birthday.getDate())) a--;
    return Math.max(0, a);
  }
  function nameMath(name) {
    var s = 0;
    for (var i = 0; i < name.length; i++) s += name.codePointAt(i);
    var ge = mod(s, 81) + 1;
    var tail = ge % 10;
    var wx = (tail === 1 || tail === 2) ? '木' : (tail === 3 || tail === 4) ? '火'
      : (tail === 5 || tail === 6) ? '土' : (tail === 7 || tail === 8) ? '金' : '水';
    return { sum: s, ge: ge, wx: wx, len: name.length };
  }

  /* ============================ 黄道十二神 ============================ */
  var SHEN12 = ['青龙', '明堂', '天刑', '朱雀', '金匮', '天德', '白虎', '玉堂', '天牢', '玄武', '司命', '勾陈'];
  var HUANG = ['青龙', '明堂', '金匮', '天德', '玉堂', '司命'];
  // 青龙起时口诀：子午起申、卯酉起寅、寅申起子、巳亥起午、辰戌起辰、丑未起戌
  var QL_START = { 0: 8, 6: 8, 3: 2, 9: 2, 2: 0, 8: 0, 5: 6, 11: 6, 4: 4, 10: 4, 1: 10, 7: 10 };
  var WX_ZHI = { '木': [2, 3], '火': [5, 6], '土': [4, 10, 1, 7], '金': [8, 9], '水': [11, 0] };
  var WX_GAN = { '木': [0, 1], '火': [2, 3], '土': [4, 5], '金': [6, 7], '水': [8, 9] };
  function auspiciousHour(date, useWX) {
    var zhi = dayGZ(date).zhi;
    var start = QL_START[zhi];
    var want = WX_ZHI[useWX] || [8];
    var best = null, nearest = null, nearestDist = 99;
    for (var i = 0; i < 12; i++) {
      var z = mod(start + i, 12);
      var shen = SHEN12[i];
      if (HUANG.indexOf(shen) < 0) continue;
      var item = { zhi: z, shen: shen, name: ZHI_HOUR[z] + '时', range: HOUR_RANGE[z] };
      if (want.indexOf(z) >= 0 && !best) best = item;   // 用神时辰又逢黄道，最上
      var dist = 99;
      want.forEach(function (w) { dist = Math.min(dist, Math.min(mod(z - w, 12), mod(w - z, 12))); });
      if (dist < nearestDist) { nearestDist = dist; nearest = item; }
    }
    return best || nearest || { zhi: 8, shen: '青龙', name: '申时', range: HOUR_RANGE[8] };
  }

  /* ============================ 体用生克判分 ============================ */
  function relationScore(bodyWX, useWX) {
    if (sheng(useWX, bodyWX)) return { d: 18, t: '用生体 · 气来生我，事来就人' };
    if (useWX === bodyWX) return { d: 12, t: '体用比和 · 同气相求' };
    if (ke(bodyWX, useWX)) return { d: 6, t: '体克用 · 我制其事，可成而费力' };
    if (sheng(bodyWX, useWX)) return { d: -8, t: '体生用 · 我气外泄，成事耗神' };
    if (ke(useWX, bodyWX)) return { d: -18, t: '用克体 · 事来制我，其势不顺' };
    return { d: 0, t: '体用平和' };
  }

  /* ============================ 主排盘 ============================ */
  /**
   * @param {Object} in 输入
   *  name, birthday(Date), gender('男'|'女'|'其他'), wish,
   *  birthProvince, birthCity, currProvince, currCity,
   *  birthLL, currLL, now(Date, 可选)
   */
  function cast(input) {
    var now = input.now || new Date();
    var name = String(input.name || '无名').trim() || '无名';
    var wish = String(input.wish || '所愿之事').trim() || '所愿之事';
    var bd = input.birthday;
    var age = ageOf(bd, now);

    /* ---- 1. 起卦时刻四柱 ---- */
    var pillars = fourPillars(now);
    var yGZ = pillars.yearGZ;

    /* ---- 2. 起卦：时间起卦为经，字气 / 事由 / 命主日柱为纬 ---- */
    var yearZhiNum = yGZ.zhi + 1;                  // 子1 … 亥12
    var lunarM = mod(now.getMonth() + 1, 12) || 12; // 近似月数
    var dayN = now.getDate(), shiN = hourZhiIndex(now) + 1;
    var nameN = nameMath(name).ge;                     // 姓名字气 1–81
    var wishN = mod(hash(wish + '|' + name), 81) + 1;  // 事由摄气
    var mingN = dayGZ(bd).idx + 1;                     // 命主日柱气数 1–60
    var up = mod(yearZhiNum + lunarM + dayN + nameN + mingN, 8) || 8;
    var down = mod(yearZhiNum + lunarM + dayN + shiN + wishN + mingN, 8) || 8;
    var move = mod(yearZhiNum + lunarM + dayN + shiN + nameN + wishN + mingN, 6) || 6;

    var yao = GUA_BITS[down].concat(GUA_BITS[up]); // 自下而上六爻
    var bianYao = yao.slice();
    bianYao[move - 1] = bianYao[move - 1] ? 0 : 1;
    var bianDown = BITS_GUA[bianYao.slice(0, 3).join('')];
    var bianUp = BITS_GUA[bianYao.slice(3, 6).join('')];
    var huDown = BITS_GUA[yao.slice(1, 4).join('')];
    var huUp = BITS_GUA[yao.slice(2, 5).join('')];

    /* ---- 3. 体用（动爻所在之卦为用，静卦为体） ---- */
    var bodyGua = move <= 3 ? up : down;
    var useGua = move <= 3 ? down : up;
    var bodyWX = GUA_WX[bodyGua], useWX = GUA_WX[useGua];
    var bBodyWX = GUA_WX[move <= 3 ? bianUp : bianDown];
    var bUseWX = GUA_WX[move <= 3 ? bianDown : bianUp];

    var details = [];
    function add(label, delta, note) { details.push({ label: label, delta: delta, note: note }); }

    var rel = relationScore(bodyWX, useWX);
    add('体用生克（本卦）', rel.d, rel.t);
    var rel2 = relationScore(bBodyWX, bUseWX);
    add('体用生克（变卦）', Math.round(rel2.d * 0.5), '变后之气，权重减半：' + rel2.t);

    /* ---- 4. 动爻得位、爻位吉凶 ---- */
    var yaoVal = yao[move - 1];
    var deWei = (move % 2 === 1) === (yaoVal === 1);
    var yaoDelta = (deWei ? 4 : -3)
      + (move === 5 ? 3 : 0) + (move === 3 ? -2 : 0) + (move === 6 ? -1 : 0) + (move === 1 ? 1 : 0);
    add('动爻得位', yaoDelta,
      '第' + move + '爻' + (yaoVal ? '阳' : '阴') + '动，' + (deWei ? '得位（阳居阳 / 阴居阴）' : '失位'));

    /* ---- 5. 月令旺相 ---- */
    var seasonWX = ZHI_WX[monthGZ(now, yGZ.gan).zhi];
    var seasonDelta = seasonWX === bodyWX ? 5 : sheng(seasonWX, bodyWX) ? 3
      : sheng(bodyWX, seasonWX) ? -3 : ke(seasonWX, bodyWX) ? -5 : -1;
    add('月令旺相', seasonDelta, '起卦月令属' + seasonWX + '，体卦属' + bodyWX);

    /* ---- 6. 姓名字气数理（81 数理五行） ---- */
    var nm = nameMath(name);
    var nameDelta = sheng(nm.wx, bodyWX) ? 6 : ke(nm.wx, bodyWX) ? -6
      : nm.wx === bodyWX ? 3 : ke(bodyWX, nm.wx) ? 2 : -2;
    add('姓名字气数理', nameDelta, '「' + name + '」总格 ' + nm.ge + ' 数，属' + nm.wx + '，与体卦' + bodyWX);

    /* ---- 7. 大运流年 ---- */
    var flowGan = mod(now.getFullYear() - 4, 10);
    var flowWX = GAN_WX[flowGan];
    var birthDayGZ = dayGZ(bd);
    var mingWX = GAN_WX[birthDayGZ.gan];
    var flowDelta = flowWX === mingWX ? 4 : sheng(flowWX, mingWX) ? 8
      : sheng(mingWX, flowWX) ? -2 : ke(flowWX, mingWX) ? -8 : 3;
    add('大运流年', flowDelta,
      '虚岁 ' + (age + 1) + '，' + Math.floor((age + 1) / 10) + '旬大运；' + GAN[flowGan] + '年（' + flowWX + '）对命日' + GAN[birthDayGZ.gan] + '（' + mingWX + '）');

    /* ---- 8. 本命阴阳 ---- */
    var genderYang = input.gender === '男' ? true : input.gender === '女' ? false : (yearGZ(bd).gan % 2 === 0);
    var dayYang = pillars.dayGZ.gan % 2 === 0;
    var yyDelta = genderYang !== dayYang ? 3 : -1;
    add('本命阴阳', yyDelta,
      (genderYang ? '阳命' : '阴命') + ' 对 ' + (dayYang ? '阳日' : '阴日') + '，' + (genderYang !== dayYang ? '阴阳相感' : '纯阳/纯阴偏气'));

    /* ---- 9. 洛书九宫：来龙祖气 / 坐向磁场 ---- */
    var bLL = input.birthLL || CENTER, cLL = input.currLL || CENTER;
    var g1 = palaceOf(bLL.lng, bLL.lat), g2 = palaceOf(cLL.lng, cLL.lat);
    var gongDelta;
    var gongNote;
    if (g1 === 5 || g2 === 5) { gongDelta = 2; gongNote = '中宫立极，气不分野'; }
    else if (g1 + g2 === 10) { gongDelta = 7; gongNote = '洛书生成合气（' + g1 + ' + ' + g2 + ' = 10）'; }
    else if (g1 === g2) { gongDelta = 2; gongNote = '伏位同气，来龙与坐向同宫'; }
    else {
      gongDelta = mod(g1 + g2, 5) - 2;
      gongNote = g1 + '宫来龙 → ' + g2 + '宫坐向，气有迁转';
    }
    var w1 = GONG_WX[g1], w2 = GONG_WX[g2];
    var qiDelta = sheng(w1, w2) ? 3 : ke(w1, w2) ? -3 : w1 === w2 ? 1 : 0;
    add('九宫地气', gongDelta + qiDelta,
      '出生地 ' + GONG_NAME[g1] + '（' + w1 + '），所在地 ' + GONG_NAME[g2] + '（' + w2 + '）；' + gongNote);

    /* ---- 10. 事由语义爻动 ---- */
    var h = hash(wish + '|' + name);
    var wishYao = mod(h, 6) + 1;
    var goodWord = /(找到|成功|通过|上岸|康复|录取|结婚|复合|涨|赚|治愈|顺|得|成|合|胜|安)/.test(wish);
    var badWord = /(不|没|难|失|分手|失败|丢|破|病|亏|输|离|忌)/.test(wish);
    var wishDelta = (wishYao === move ? 3 : -1) + (goodWord ? 3 : 0) + (badWord ? -4 : 0) + (wish.length > 12 ? 1 : 0);
    add('事由语义爻动', wishDelta,
      '「' + wish + '」摄气入第 ' + wishYao + ' 爻' + (wishYao === move ? '，与卦动爻相应' : '，与卦动爻未应')
      + (goodWord ? '；语带吉机' : '') + (badWord ? '；语带阻滞' : ''));

    /* ---- 11. 合成概率 ---- */
    var raw = 50;
    details.forEach(function (x) { raw += x.delta; });
    var p = 3 + 94 / (1 + Math.exp(-(raw - 50) / 12));
    p = Math.min(97, Math.max(3, p));

    /* ---- 12. 天定应期 ---- */
    var seed = up + down + move + bodyGua + g1 + g2 + mod(h, 9) + mod(age, 12) + pillars.dayGZ.idx;
    var days = 9 + mod(seed * 7 + mod(h, 31), 330);
    var hold = mod(seed, 4);
    var target = new Date(now.getTime() + (days + hold) * 86400000);
    var wantZhi = WX_ZHI[useWX] || [8];
    var wantGan = WX_GAN[useWX] || [0];
    var aligned = 0;
    for (var i = 0; i < 24; i++) {
      var dg = dayGZ(target);
      if (wantGan.indexOf(dg.gan) >= 0 || wantZhi.indexOf(dg.zhi) >= 0) break;
      target = new Date(target.getTime() + 86400000);
      aligned++;
    }
    var ah = auspiciousHour(target, useWX);
    var targetPillars = fourPillars(new Date(target.getFullYear(), target.getMonth(), target.getDate(),
      ah.zhi === 0 ? 23 : (ah.zhi * 2 - 1), 0, 0));
    var totalDays = Math.round((target - now) / 86400000);

    var verdict = p >= 75 ? '天时人事两谐，气数已就，宜乘势而进，勿自生疑。'
      : p >= 58 ? '体用有生，事有可成之基，然须待时借势，进而不躁则得。'
        : p >= 42 ? '气机半开半阖，成毁未定；宜先固本、修其人事，再观应期之验。'
          : p >= 28 ? '用气偏逆，目下强求多耗；宜缓图、易方、蓄势，至应期再举。'
            : '卦气受制，时未与我；此占主「守」，养气待运，不宜遽决。';

    return {
      now: now,
      name: name, wish: wish, gender: input.gender, age: age,
      birthday: bd,
      birthPlace: input.birthProvince + ' · ' + input.birthCity,
      currPlace: input.currProvince + ' · ' + input.currCity,
      pillars: pillars,
      birthPillars: {
        year: yearGZ(bd).text,
        month: monthGZ(bd, yearGZ(bd).gan).text,
        day: birthDayGZ.text
      },
      up: up, down: down, move: move, yao: yao, bianYao: bianYao,
      benName: gua64Name(up, down), bianName: gua64Name(bianUp, bianDown),
      huName: gua64Name(huUp, huDown),
      bianUp: bianUp, bianDown: bianDown, huUp: huUp, huDown: huDown,
      bodyGua: bodyGua, useGua: useGua, bodyWX: bodyWX, useWX: useWX,
      palaceBirth: g1, palaceCurr: g2,
      nameMath: nm, flow: GAN[flowGan] + '年',
      details: details, raw: raw, probability: +p.toFixed(1), verdict: verdict,
      date: target,
      solar: solarText(target),
      lunar: lunarText(target),
      ganzhi: targetPillars,
      auspicious: ah,
      offsetDays: totalDays, alignedDays: aligned,
      seed: seed
    };
  }

  API.cast = cast;
  API.REGIONS = null; // 由 regions 数据注入（见下方）
  API.util = { mod: mod, hash: hash, fourPillars: fourPillars, palaceOf: palaceOf, GUA_NAME: GUA_NAME, GUA_SYMBOL: GUA_SYMBOL, GUA64: GUA64, gua64Name: gua64Name, GUA_BITS: GUA_BITS, esc: esc, lunarText: lunarText, solarText: solarText, hourZhiIndex: hourZhiIndex, ZHI: ZHI };
  root.MeiHua = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;

  /* ============================ 中国省份 / 城市 ============================ */
  var REGIONS = {
    '北京市': { ll: [116.4, 39.9], cities: ['东城区', '西城区', '朝阳区', '海淀区', '丰台区', '石景山区', '门头沟区', '房山区', '通州区', '顺义区', '昌平区', '大兴区', '怀柔区', '平谷区', '密云区', '延庆区'] },
    '天津市': { ll: [117.2, 39.1], cities: ['和平区', '河东区', '河西区', '南开区', '河北区', '红桥区', '东丽区', '西青区', '津南区', '北辰区', '武清区', '宝坻区', '滨海新区', '宁河区', '静海区', '蓟州区'] },
    '河北省': { ll: [114.5, 38.0], cities: ['石家庄市', '唐山市', '秦皇岛市', '邯郸市', '邢台市', '保定市', '张家口市', '承德市', '沧州市', '廊坊市', '衡水市', '雄安新区'] },
    '山西省': { ll: [112.5, 37.9], cities: ['太原市', '大同市', '阳泉市', '长治市', '晋城市', '朔州市', '晋中市', '运城市', '忻州市', '临汾市', '吕梁市'] },
    '内蒙古自治区': { ll: [111.7, 40.8], cities: ['呼和浩特市', '包头市', '乌海市', '赤峰市', '通辽市', '鄂尔多斯市', '呼伦贝尔市', '巴彦淖尔市', '乌兰察布市', '兴安盟', '锡林郭勒盟', '阿拉善盟'] },
    '辽宁省': { ll: [123.4, 41.8], cities: ['沈阳市', '大连市', '鞍山市', '抚顺市', '本溪市', '丹东市', '锦州市', '营口市', '阜新市', '辽阳市', '盘锦市', '铁岭市', '朝阳市', '葫芦岛市'] },
    '吉林省': { ll: [125.3, 43.9], cities: ['长春市', '吉林市', '四平市', '辽源市', '通化市', '白山市', '松原市', '白城市', '延边朝鲜族自治州'] },
    '黑龙江省': { ll: [126.6, 45.8], cities: ['哈尔滨市', '齐齐哈尔市', '鸡西市', '鹤岗市', '双鸭山市', '大庆市', '伊春市', '佳木斯市', '七台河市', '牡丹江市', '黑河市', '绥化市', '大兴安岭地区'] },
    '上海市': { ll: [121.5, 31.2], cities: ['黄浦区', '徐汇区', '长宁区', '静安区', '普陀区', '虹口区', '杨浦区', '浦东新区', '闵行区', '宝山区', '嘉定区', '松江区', '青浦区', '奉贤区', '金山区', '崇明区'] },
    '江苏省': { ll: [118.8, 32.1], cities: ['南京市', '无锡市', '徐州市', '常州市', '苏州市', '南通市', '连云港市', '淮安市', '盐城市', '扬州市', '镇江市', '泰州市', '宿迁市'] },
    '浙江省': { ll: [120.2, 30.3], cities: ['杭州市', '宁波市', '温州市', '嘉兴市', '湖州市', '绍兴市', '金华市', '衢州市', '舟山市', '台州市', '丽水市'] },
    '安徽省': { ll: [117.2, 31.8], cities: ['合肥市', '芜湖市', '蚌埠市', '淮南市', '马鞍山市', '淮北市', '铜陵市', '安庆市', '黄山市', '滁州市', '阜阳市', '宿州市', '六安市', '亳州市', '池州市', '宣城市'] },
    '福建省': { ll: [119.3, 26.1], cities: ['福州市', '厦门市', '莆田市', '三明市', '泉州市', '漳州市', '南平市', '龙岩市', '宁德市', '平潭综合实验区'] },
    '江西省': { ll: [115.9, 28.7], cities: ['南昌市', '景德镇市', '萍乡市', '九江市', '新余市', '鹰潭市', '赣州市', '吉安市', '宜春市', '抚州市', '上饶市'] },
    '山东省': { ll: [117.0, 36.7], cities: ['济南市', '青岛市', '淄博市', '枣庄市', '东营市', '烟台市', '潍坊市', '济宁市', '泰安市', '威海市', '日照市', '临沂市', '德州市', '聊城市', '滨州市', '菏泽市'] },
    '河南省': { ll: [113.6, 34.7], cities: ['郑州市', '开封市', '洛阳市', '平顶山市', '安阳市', '鹤壁市', '新乡市', '焦作市', '濮阳市', '许昌市', '漯河市', '三门峡市', '南阳市', '商丘市', '信阳市', '周口市', '驻马店市', '济源市'] },
    '湖北省': { ll: [114.3, 30.6], cities: ['武汉市', '黄石市', '十堰市', '宜昌市', '襄阳市', '鄂州市', '荆门市', '孝感市', '荆州市', '黄冈市', '咸宁市', '随州市', '恩施土家族苗族自治州', '仙桃市', '潜江市', '天门市', '神农架林区'] },
    '湖南省': { ll: [112.9, 28.2], cities: ['长沙市', '株洲市', '湘潭市', '衡阳市', '邵阳市', '岳阳市', '常德市', '张家界市', '益阳市', '郴州市', '永州市', '怀化市', '娄底市', '湘西土家族苗族自治州'] },
    '广东省': { ll: [113.3, 23.1], cities: ['广州市', '韶关市', '深圳市', '珠海市', '汕头市', '佛山市', '江门市', '湛江市', '茂名市', '肇庆市', '惠州市', '梅州市', '汕尾市', '河源市', '阳江市', '清远市', '东莞市', '中山市', '潮州市', '揭阳市', '云浮市'] },
    '广西壮族自治区': { ll: [108.3, 22.8], cities: ['南宁市', '柳州市', '桂林市', '梧州市', '北海市', '防城港市', '钦州市', '贵港市', '玉林市', '百色市', '贺州市', '河池市', '来宾市', '崇左市'] },
    '海南省': { ll: [110.3, 20.0], cities: ['海口市', '三亚市', '三沙市', '儋州市', '五指山市', '琼海市', '文昌市', '万宁市', '东方市', '定安县', '屯昌县', '澄迈县', '临高县', '白沙黎族自治县', '昌江黎族自治县', '乐东黎族自治县', '陵水黎族自治县', '保亭黎族苗族自治县', '琼中黎族苗族自治县'] },
    '重庆市': { ll: [106.5, 29.6], cities: ['渝中区', '江北区', '南岸区', '沙坪坝区', '九龙坡区', '大渡口区', '北碚区', '渝北区', '巴南区', '万州区', '涪陵区', '永川区', '合川区', '江津区', '南川区', '长寿区', '黔江区', '綦江区', '大足区', '璧山区', '铜梁区', '潼南区', '荣昌区', '开州区', '梁平区', '武隆区', '城口县', '丰都县', '垫江县', '忠县', '云阳县', '奉节县', '巫山县', '巫溪县'] },
    '四川省': { ll: [104.1, 30.7], cities: ['成都市', '自贡市', '攀枝花市', '泸州市', '德阳市', '绵阳市', '广元市', '遂宁市', '内江市', '乐山市', '南充市', '眉山市', '宜宾市', '广安市', '达州市', '雅安市', '巴中市', '资阳市', '阿坝藏族羌族自治州', '甘孜藏族自治州', '凉山彝族自治州'] },
    '贵州省': { ll: [106.7, 26.6], cities: ['贵阳市', '六盘水市', '遵义市', '安顺市', '毕节市', '铜仁市', '黔西南布依族苗族自治州', '黔东南苗族侗族自治州', '黔南布依族苗族自治州'] },
    '云南省': { ll: [102.7, 25.0], cities: ['昆明市', '曲靖市', '玉溪市', '保山市', '昭通市', '丽江市', '普洱市', '临沧市', '楚雄彝族自治州', '红河哈尼族彝族自治州', '文山壮族苗族自治州', '西双版纳傣族自治州', '大理白族自治州', '德宏傣族景颇族自治州', '怒江傈僳族自治州', '迪庆藏族自治州'] },
    '西藏自治区': { ll: [91.1, 29.7], cities: ['拉萨市', '日喀则市', '昌都市', '林芝市', '山南市', '那曲市', '阿里地区'] },
    '陕西省': { ll: [108.9, 34.3], cities: ['西安市', '铜川市', '宝鸡市', '咸阳市', '渭南市', '延安市', '汉中市', '榆林市', '安康市', '商洛市', '杨凌示范区'] },
    '甘肃省': { ll: [103.8, 36.1], cities: ['兰州市', '嘉峪关市', '金昌市', '白银市', '天水市', '武威市', '张掖市', '平凉市', '酒泉市', '庆阳市', '定西市', '陇南市', '临夏回族自治州', '甘南藏族自治州'] },
    '青海省': { ll: [101.8, 36.6], cities: ['西宁市', '海东市', '海北藏族自治州', '黄南藏族自治州', '海南藏族自治州', '果洛藏族自治州', '玉树藏族自治州', '海西蒙古族藏族自治州'] },
    '宁夏回族自治区': { ll: [106.2, 38.5], cities: ['银川市', '石嘴山市', '吴忠市', '固原市', '中卫市'] },
    '新疆维吾尔自治区': { ll: [87.6, 43.8], cities: ['乌鲁木齐市', '克拉玛依市', '吐鲁番市', '哈密市', '昌吉回族自治州', '博尔塔拉蒙古自治州', '巴音郭楞蒙古自治州', '阿克苏地区', '克孜勒苏柯尔克孜自治州', '喀什地区', '和田地区', '伊犁哈萨克自治州', '塔城地区', '阿勒泰地区', '石河子市', '阿拉尔市', '图木舒克市', '五家渠市', '北屯市', '铁门关市', '双河市', '可克达拉市', '昆玉市', '胡杨河市', '新星市'] },
    '台湾省': { ll: [121.0, 23.7], cities: ['台北市', '新北市', '桃园市', '台中市', '台南市', '高雄市', '基隆市', '新竹市', '嘉义市', '新竹县', '苗栗县', '彰化县', '南投县', '云林县', '嘉义县', '屏东县', '宜兰县', '花莲县', '台东县', '澎湖县', '金门县', '连江县'] },
    '香港特别行政区': { ll: [114.2, 22.3], cities: ['香港岛', '九龙', '新界', '离岛'] },
    '澳门特别行政区': { ll: [113.5, 22.2], cities: ['澳门半岛', '氹仔', '路环', '路氹'] }
  };
  API.REGIONS = REGIONS;
  API.regionLL = function (province, city) {
    var r = REGIONS[province];
    if (!r) return CENTER;
    var i = r.cities.indexOf(city);
    if (i < 0) i = 0;
    return cityLL(r.ll, i, r.cities.length);
  };

  /* ============================ 浏览器 UI ============================ */
  if (typeof document === 'undefined' || !document.getElementById) return;

  var $ = function (id) { return document.getElementById(id); };
  var U = API.util;

  function fillSelect(sel, arr, placeholder) {
    sel.innerHTML = '';
    if (placeholder) {
      var o = document.createElement('option');
      o.value = ''; o.textContent = placeholder; o.disabled = true; o.selected = true;
      sel.appendChild(o);
    }
    arr.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v; o.textContent = v;
      sel.appendChild(o);
    });
  }
  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
  function refreshDays() {
    var y = +$('bYear').value || 2000, m = +$('bMonth').value || 1;
    var cur = +$('bDay').value || 1;
    var max = daysInMonth(y, m);
    var arr = []; for (var i = 1; i <= max; i++) arr.push(i);
    fillSelect($('bDay'), arr.map(String));
    $('bDay').value = String(Math.min(cur, max));
    refreshAge();
  }
  function refreshAge() {
    var y = +$('bYear').value, m = +$('bMonth').value, d = +$('bDay').value;
    if (!y || !m || !d) { $('ageOut').textContent = '—'; return; }
    var bd = new Date(y, m - 1, d);
    var now = new Date();
    var a = now.getFullYear() - y - ((now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) ? 1 : 0);
    $('ageOut').textContent = Math.max(0, a) + ' 周岁';
  }
  function bindRegion(pSel, cSel) {
    fillSelect($(pSel), Object.keys(REGIONS), '请选择省份 / 直辖市');
    fillSelect($(cSel), [], '请先选择省份');
    $(pSel).addEventListener('change', function () {
      var r = REGIONS[this.value];
      fillSelect($(cSel), r ? r.cities : [], r ? '请选择城市 / 区县' : '请先选择省份');
      if (r) $(cSel).selectedIndex = 1;
    });
  }
  function initForm() {
    var now = new Date();
    var ys = []; for (var y = 1900; y <= now.getFullYear(); y++) ys.push(String(y));
    fillSelect($('bYear'), ys);
    $('bYear').value = String(Math.max(1900, now.getFullYear() - 25));
    fillSelect($('bMonth'), Array.from({ length: 12 }, function (_, i) { return String(i + 1); }));
    $('bMonth').value = '6';
    refreshDays();
    $('bDay').value = '15';
    refreshAge();
    ['bYear', 'bMonth', 'bDay'].forEach(function (id) { $(id).addEventListener('change', id === 'bDay' ? refreshAge : refreshDays); });
    bindRegion('birthProvince', 'birthCity');
    bindRegion('currProvince', 'currCity');
    $('birthProvince').value = '江苏省';
    $('birthProvince').dispatchEvent(new Event('change'));
    $('birthCity').value = '镇江市';
    $('currProvince').value = '江苏省';
    $('currProvince').dispatchEvent(new Event('change'));
    $('currCity').value = '镇江市';
    $('wish').value = '找到女朋友';
  }

  function tickClock() {
    var d = new Date();
    var fp = U.fourPillars(d);
    $('clock').textContent = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2)
      + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2)
      + ' · ' + fp.year + '年 ' + fp.month + '月 ' + fp.day + '日 ' + fp.hour + '时';
  }

  function yaoHtml(yao, move) {
    // 自上而下呈现（上爻在最上）
    var out = '';
    for (var i = 5; i >= 0; i--) {
      var isMove = (i + 1) === move;
      var cls = 'yao' + (isMove ? ' move' : '');
      if (yao[i]) out += '<div class="' + cls + '"><span class="bar full"></span><em>' + (isMove ? '○ 动' : '') + '</em></div>';
      else out += '<div class="' + cls + '"><span class="bar half"></span><span class="bar half"></span><em>' + (isMove ? '× 动' : '') + '</em></div>';
    }
    return out;
  }
  function guaCard(title, up, down, yaoArr, move, subtitle) {
    return '<div class="gua-card">'
      + '<div class="gua-title">' + U.esc(title) + '</div>'
      + '<div class="gua-sym">' + U.GUA_SYMBOL[up] + '<small>上</small></div>'
      + '<div class="yaos">' + yaoHtml(yaoArr, move) + '</div>'
      + '<div class="gua-sym">' + U.GUA_SYMBOL[down] + '<small>下</small></div>'
      + '<div class="gua-name">' + U.esc(U.gua64Name(up, down)) + '</div>'
      + '<div class="gua-sub">' + U.esc(subtitle) + '</div>'
      + '</div>';
  }
  function detailHtml(list) {
    return list.map(function (x) {
      var cls = x.delta > 0 ? 'plus' : x.delta < 0 ? 'minus' : 'flat';
      var sign = x.delta > 0 ? '+' : '';
      return '<div class="row"><div class="row-main"><b>' + U.esc(x.label) + '</b><span>' + U.esc(x.note) + '</span></div>'
        + '<div class="delta ' + cls + '">' + sign + x.delta + '</div></div>';
    }).join('');
  }

  function render(r) {
    var p = r.probability;
    $('result').hidden = false;
    $('pNum').textContent = p.toFixed(1) + '%';
    $('ring').style.background = 'conic-gradient(var(--gold) ' + (p * 3.6) + 'deg, rgba(212,175,91,.10) 0deg)';
    $('verdict').textContent = r.verdict;
    $('wishEcho').textContent = r.wish;

    $('metaGrid').innerHTML = [
      ['求占之人', r.name + ' · ' + r.gender + ' · ' + r.age + ' 周岁'],
      ['生辰三柱', r.birthPillars.year + ' / ' + r.birthPillars.month + ' / ' + r.birthPillars.day + '（时阙，以日柱立命）'],
      ['来龙祖气', r.birthPlace],
      ['当前坐向', r.currPlace],
      ['起卦四柱', r.pillars.year + ' ' + r.pillars.month + ' ' + r.pillars.day + ' ' + r.pillars.hour],
      ['流年', r.flow]
    ].map(function (x) { return '<div class="meta"><span>' + U.esc(x[0]) + '</span><b>' + U.esc(x[1]) + '</b></div>'; }).join('');

    var benYao = U.GUA_BITS[r.down].concat(U.GUA_BITS[r.up]);
    var bianYao = U.GUA_BITS[r.bianDown].concat(U.GUA_BITS[r.bianUp]);
    $('guaRow').innerHTML =
      guaCard('本卦 · 事之现状', r.up, r.down, benYao, r.move,
        '上' + U.GUA_NAME[r.up] + '下' + U.GUA_NAME[r.down] + ' · 第' + r.move + '爻动')
      + guaCard('变卦 · 事之归趋', r.bianUp, r.bianDown, bianYao, 0,
        '动爻既变，气机转处')
      + '<div class="gua-extra"><div class="gua-title">互卦 · 事之中曲</div><div class="hu">'
      + U.GUA_SYMBOL[r.huUp] + U.GUA_SYMBOL[r.huDown] + '</div><div class="gua-name">'
      + U.esc(r.huName) + '</div><div class="gua-sub">二三四爻为下互，三四五爻为上互</div>'
      + '<div class="tiyong">体卦 <b>' + U.GUA_NAME[r.bodyGua] + '（' + r.bodyWX + '）</b><br>用卦 <b>'
      + U.GUA_NAME[r.useGua] + '（' + r.useWX + '）</b><br>洛书 <b>'
      + r.palaceBirth + '宫 → ' + r.palaceCurr + '宫</b></div></div>';

    $('details').innerHTML = detailHtml(r.details);
    $('rawLine').textContent = '气数基准 50，诸项增减合计 ' + (r.raw - 50 > 0 ? '+' : '') + (r.raw - 50) + ' → 合数 ' + r.raw + '，经气机收敛得概率。';

    $('dateGrid').innerHTML = [
      ['天定应期 · 公历', r.solar],
      ['农历 · 干支', r.lunar],
      ['应期干支四柱', r.ganzhi.year + '年 ' + r.ganzhi.month + '月 ' + r.ganzhi.day + '日 ' + r.ganzhi.hour + '时'],
      ['吉神时辰', r.auspicious.name + ' · ' + r.auspicious.shen + '（黄道） · ' + r.auspicious.range],
      ['距起卦', r.offsetDays + ' 日' + (r.alignedDays ? '（另候用神当令 ' + r.alignedDays + ' 日）' : '（用神当令，不另移）')]
    ].map(function (x) { return '<div class="date-item"><span>' + U.esc(x[0]) + '</span><b>' + U.esc(x[1]) + '</b></div>'; }).join('');

    if (typeof $('result').scrollIntoView === 'function') {
      $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function doCast() {
    var y = +$('bYear').value, m = +$('bMonth').value, d = +$('bDay').value;
    var bp = $('birthProvince').value, bc = $('birthCity').value;
    var cp = $('currProvince').value, cc = $('currCity').value;
    if (!bp || !bc || !cp || !cc) { alert('请把出生地与所在地的省、市都选完整。'); return; }
    var name = $('name').value.trim();
    var wish = $('wish').value.trim();
    if (!name) { alert('请填写姓名。'); return; }
    if (!wish) { alert('请填写所求之事。'); return; }
    var r = API.cast({
      name: name,
      birthday: new Date(y, m - 1, d),
      gender: $('gender').value,
      wish: wish,
      birthProvince: bp, birthCity: bc, currProvince: cp, currCity: cc,
      birthLL: API.regionLL(bp, bc), currLL: API.regionLL(cp, cc),
      now: new Date()
    });
    render(r);
  }

  function boot() {
    initForm();
    tickClock();
    setInterval(tickClock, 1000);
    $('castBtn').addEventListener('click', doCast);
    $('form').addEventListener('submit', function (e) { e.preventDefault(); doCast(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
