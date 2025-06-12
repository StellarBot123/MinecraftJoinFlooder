import fs from 'fs'
import { createClient } from 'minecraft-protocol'
import { SocksClient } from 'socks'

// 🔥 Protection anti crash global
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err.message)
})
process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason)
})

// ✅ Lecture des arguments CLI
const SERVER_HOST = process.argv[2]
const SERVER_PORT = parseInt(process.argv[3])
const BOT_COUNT = parseInt(process.argv[4])
const RUNTIME_SECONDS = parseInt(process.argv[5]) || 60

// ❌ Vérification stricte des arguments
if (!SERVER_HOST || isNaN(SERVER_PORT) || isNaN(BOT_COUNT)) {
  console.error('❌ Usage: node rawBotWithProxyCheck.js <host> <port> <count> <duration_sec>')
  process.exit(1)
}

// ✅ Lecture et nettoyage de socks5.txt
const rawProxies = fs.readFileSync('socks5.txt', 'utf-8')
  .split('\n')
  .map(line => line.trim())
  .filter(line => line.length > 0)

console.log(`🔍 Vérification de ${rawProxies.length} proxies SOCKS5...`)

// 🔁 Test unitaire d’un proxy
function testProxy(proxy) {
  const [ip, port] = proxy.split(':')
  return SocksClient.createConnection({
    proxy: { ipaddress: ip, port: parseInt(port), type: 5 },
    command: 'connect',
    destination: { host: '1.1.1.1', port: 53 },
    timeout: 1500
  }).then(info => {
    info.socket.destroy()
    return true
  }).catch(() => false)
}

// ✅ Test des proxies avant utilisation
const validProxies = []
await Promise.all(rawProxies.map(async (proxy) => {
  if (await testProxy(proxy)) {
    console.log(`✅ Proxy OK: ${proxy}`)
    validProxies.push(proxy)
  }
}))

if (validProxies.length === 0) {
  console.error('❌ Aucun proxy SOCKS5 valide détecté.')
  process.exit(1)
}

console.log(`🚀 Lancement de ${BOT_COUNT} bots vers ${SERVER_HOST}:${SERVER_PORT} pendant ${RUNTIME_SECONDS}s`)

const clients = []

function generateUsername() {
  return 'Bot_' + Math.random().toString(36).substring(7)
}

function delay(ms) {
  return new Promise(res => setTimeout(res, ms))
}

async function launchBot(i) {
  const proxy = validProxies[i % validProxies.length]
  const [proxyHost, proxyPort] = proxy.split(':')
  const username = generateUsername()

  try {
    const info = await SocksClient.createConnection({
      proxy: {
        ipaddress: proxyHost,
        port: parseInt(proxyPort),
        type: 5
      },
      command: 'connect',
      destination: {
        host: SERVER_HOST,
        port: SERVER_PORT
      },
      timeout: 30000
    })

    const client = createClient({
    socket: info.socket,
    username,
    version: '1.20.1',
    host: SERVER_HOST,         // ← obligatoire quand socket custom
    port: SERVER_PORT          // ← idem
    })

    clients.push(client)

    client.on('connect', () => {
      console.log(`[BOT ${i}] ✅ Connecté via ${proxyHost}:${proxyPort} (${username})`)
    })

    client.on('end', () => {
      console.log(`[BOT ${i}] ❌ Déconnecté`)
    })

    client.on('error', err => {
      console.error(`[BOT ${i}] ⚠️ Erreur: ${err.message}`)
    })

    client.on('kick_disconnect', packet => {
      console.log(`[BOT ${i}] ❌ Kick: ${JSON.stringify(packet)}`)
    })

    client._client.on('error', err => {
      console.error(`[BOT ${i}] ⚠️ Socket crash: ${err.message}`)
    })

  } catch (err) {
    // Silent fail for proxy error
  }
}

// 🚦 Lancer les bots avec un délai entre chaque
for (let i = 0; i < BOT_COUNT; i++) {
  await delay(200)
  launchBot(i)
}

// ⏱️ Arrêt automatique après X secondes
setTimeout(() => {
  console.log(`🛑 Temps écoulé (${RUNTIME_SECONDS}s), arrêt des bots...`)
  for (const bot of clients) {
    try { bot.end() } catch (e) {}
  }
  process.exit(0)
}, RUNTIME_SECONDS * 1000)
