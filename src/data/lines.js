// 名古屋市営地下鉄 全線データ（駅・所要時間はハードコード）
// 各路線の実際の公表所要時間（概算）に合わせて区間ごとに調整済み。
// 距離(km)は運賃計算用に「所要時間×平均速度0.6km/分」で簡易算出する。

const KM_PER_MIN = 0.6

function buildSegments(stations, times, opts = {}) {
  const { loop = false } = opts
  const pairCount = loop ? stations.length : stations.length - 1
  const segments = []
  for (let i = 0; i < pairCount; i++) {
    const from = stations[i]
    const to = stations[(i + 1) % stations.length]
    const time = times[i]
    segments.push({ from, to, time, distance: Math.round(time * KM_PER_MIN * 10) / 10 })
  }
  return segments
}

export const LINES = {
  higashiyama: {
    key: 'higashiyama',
    name: '東山線',
    color: '#FFD400',
    textColor: '#333333',
    stations: [
      '高畑', '八田', '岩塚', '中村公園', '中村日赤', '本陣', '亀島', '名古屋',
      '伏見', '栄', '新栄町', '千種', '今池', '本山', '東山公園', '星ヶ丘',
      '一社', '上社', '本郷', '藤が丘',
    ],
    times: [2, 2, 2, 1, 2, 1, 2, 2, 2, 1, 2, 1, 3, 2, 2, 2, 2, 1, 2],
  },
  meijo: {
    key: 'meijo',
    name: '名城線',
    color: '#9B3F96',
    textColor: '#ffffff',
    loop: true,
    stations: [
      '金山', '西高蔵', '神宮西', '伝馬町', '堀田', '瑞穂区役所', '瑞穂運動場東',
      '新瑞橋', '妙音通', '川名', '御器所', '荒畑', '八事', '八事日赤',
      '名古屋大学', '本山', '自由ヶ丘', '上社', '本郷', '砂田橋', '大曽根',
      '平安通', '志賀本通', '黒川', '名城公園', '市役所', '久屋大通', '栄',
      '矢場町', '上前津', '東別院',
    ],
    times: [
      1, 1, 1, 2, 2, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 2,
    ],
  },
  meiko: {
    key: 'meiko',
    name: '名港線',
    color: '#9B3F96',
    borderColor: '#ffffff',
    textColor: '#ffffff',
    stations: ['金山', '日比野', '六番町', '東海通', '築地口', '名古屋港'],
    times: [2, 3, 2, 3, 2],
  },
  tsurumai: {
    key: 'tsurumai',
    name: '鶴舞線',
    color: '#00AEEF',
    textColor: '#ffffff',
    stations: [
      '上小田井', '中小田井', '庄内緑地公園', '庄内通', '浄心', '浅間町',
      '丸の内', '伏見', '大須観音', '上前津', '鶴舞', '荒畑', '川名', 'いりなか', '八事',
      '植田', '原', '平針', '梅森坂', '赤池',
    ],
    times: [2, 2, 1, 2, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 2, 1, 2],
  },
  sakuradori: {
    key: 'sakuradori',
    name: '桜通線',
    color: '#E2231A',
    textColor: '#ffffff',
    stations: [
      '中村区役所', '名古屋', '国際センター', '丸の内', '久屋大通', '高岳',
      '清水', '車道', '今池', '吹上', '御器所', '桜本町', '瑞穂区役所',
      '瑞穂運動場西', '新端橋', '野並', '鳥栖', '相生山', '神沢', '徳重',
    ],
    times: [2, 1, 1, 2, 1, 1, 1, 2, 1, 2, 1, 2, 1, 2, 2, 2, 2, 2, 2],
  },
  kamiiida: {
    key: 'kamiiida',
    name: '上飯田線',
    color: '#F39BC4',
    textColor: '#333333',
    stations: ['平安通', '上飯田'],
    times: [3],
  },
}

export const LINE_LIST = Object.values(LINES).map((line) => ({
  ...line,
  segments: buildSegments(line.stations, line.times, { loop: !!line.loop }),
}))

export const ALL_STATION_NAMES = Array.from(
  new Set(LINE_LIST.flatMap((l) => l.stations))
).sort((a, b) => a.localeCompare(b, 'ja'))

export const TRANSFER_MINUTES = 3
