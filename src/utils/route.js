import { LINE_LIST, TRANSFER_MINUTES, BOARDING_MINUTES } from '../data/lines.js'

// ノードID: "line:station"
function nodeId(line, station) {
  return `${line}:${station}`
}

function buildGraph() {
  const adjacency = new Map() // nodeId -> [{to, time, distance, isTransfer, line}]
  const stationToNodes = new Map() // station name -> [nodeId]

  function addEdge(a, b, time, distance, extra) {
    if (!adjacency.has(a)) adjacency.set(a, [])
    adjacency.get(a).push({ to: b, time, distance, ...extra })
  }

  for (const line of LINE_LIST) {
    for (const station of line.stations) {
      const id = nodeId(line.key, station)
      if (!stationToNodes.has(station)) stationToNodes.set(station, [])
      stationToNodes.get(station).push(id)
    }
    for (const seg of line.segments) {
      const a = nodeId(line.key, seg.from)
      const b = nodeId(line.key, seg.to)
      addEdge(a, b, seg.time, seg.distance, { line: line.key, isTransfer: false })
      addEdge(b, a, seg.time, seg.distance, { line: line.key, isTransfer: false })
    }
  }

  // 乗り換えエッジ: 同名の駅が複数路線にある場合、相互に接続
  for (const [, nodes] of stationToNodes) {
    if (nodes.length < 2) continue
    for (let i = 0; i < nodes.length; i++) {
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue
        addEdge(nodes[i], nodes[j], TRANSFER_MINUTES, 0, { isTransfer: true })
      }
    }
  }

  return { adjacency, stationToNodes }
}

function dijkstra(adjacency, sourceIds) {
  const dist = new Map()
  const prev = new Map() // nodeId -> {from, edge}
  const visited = new Set()

  // 簡易優先度キュー（駅数が少ないため配列で十分）
  const queue = []
  for (const id of sourceIds) {
    dist.set(id, 0)
    queue.push(id)
  }

  while (queue.length > 0) {
    queue.sort((a, b) => (dist.get(a) ?? Infinity) - (dist.get(b) ?? Infinity))
    const current = queue.shift()
    if (visited.has(current)) continue
    visited.add(current)

    const edges = adjacency.get(current) || []
    for (const edge of edges) {
      if (visited.has(edge.to)) continue
      const newDist = (dist.get(current) ?? Infinity) + edge.time
      if (newDist < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, newDist)
        prev.set(edge.to, { from: current, edge })
        queue.push(edge.to)
      }
    }
  }

  return { dist, prev }
}

// 名古屋市交通局の対キロ区間制運賃（2019年10月改定）に準拠
// 1-3km:210円 / 4-7km:240円 / 8-11km:270円 / 12-15km:310円 / 16km以上:340円
function calcFare(distanceKm) {
  const km = Math.ceil(distanceKm)
  if (km <= 3) return 210
  if (km <= 7) return 240
  if (km <= 11) return 270
  if (km <= 15) return 310
  return 340
}

// 経路を「同一路線の連続区間（leg）」単位にまとめる
function buildLegs(path) {
  // path: [{nodeId, station, line, throughEdge}]
  const legs = []
  let current = null

  for (let i = 1; i < path.length; i++) {
    const prevStep = path[i - 1]
    const step = path[i]
    if (step.isTransfer) {
      if (current) {
        legs.push(current)
        current = null
      }
      continue
    }
    if (!current) {
      current = {
        line: step.line,
        boardStation: prevStep.station,
        alightStation: step.station,
        time: step.edgeTime,
        distance: step.edgeDistance,
      }
    } else if (current.line === step.line) {
      current.alightStation = step.station
      current.time += step.edgeTime
      current.distance += step.edgeDistance
    } else {
      legs.push(current)
      current = {
        line: step.line,
        boardStation: prevStep.station,
        alightStation: step.station,
        time: step.edgeTime,
        distance: step.edgeDistance,
      }
    }
  }
  if (current) legs.push(current)
  return legs
}

export function findRoute(originStation, destinationStation) {
  if (!originStation || !destinationStation || originStation === destinationStation) {
    return null
  }

  const { adjacency, stationToNodes } = buildGraph()
  const originNodes = stationToNodes.get(originStation) || []
  const destNodes = new Set(stationToNodes.get(destinationStation) || [])
  if (originNodes.length === 0 || destNodes.size === 0) return null

  const { dist, prev } = dijkstra(adjacency, originNodes)

  let bestNode = null
  let bestDist = Infinity
  for (const id of destNodes) {
    const d = dist.get(id)
    if (d !== undefined && d < bestDist) {
      bestDist = d
      bestNode = id
    }
  }
  if (bestNode === null) return null

  // 経路復元
  const chain = [bestNode]
  let cursor = bestNode
  while (prev.has(cursor)) {
    cursor = prev.get(cursor).from
    chain.push(cursor)
  }
  chain.reverse()

  const path = chain.map((id, idx) => {
    const [line, station] = id.split(':')
    let isTransfer = false
    let edgeTime = 0
    let edgeDistance = 0
    if (idx > 0) {
      const info = prev.get(chain[idx])
      isTransfer = info.edge.isTransfer
      edgeTime = info.edge.time
      edgeDistance = info.edge.distance
    }
    return { line, station, isTransfer, edgeTime, edgeDistance }
  })

  const legs = buildLegs(path)
  const totalTime = bestDist + BOARDING_MINUTES
  const totalDistance = legs.reduce((sum, leg) => sum + leg.distance, 0)
  const transferCount = legs.length - 1
  const fare = calcFare(totalDistance)

  return {
    legs,
    totalTime,
    totalDistance,
    transferCount,
    fare,
  }
}
