import axios from "axios";
import * as https from "https";
import {ServerEntity, ServerStats} from "./server-entity";
import {camelizeKeys} from "humps";
import * as moment from "moment";
import * as minecraft from "minecraft-protocol";
import * as winston from "winston";

const { combine, timestamp, label, printf } = winston.format;

const myFormat = printf(({ level, message, label, timestamp }) => {
  return `${timestamp} [${label}] ${level}: ${message}`;
});

const log = winston.createLogger({
  format: combine(
    label({ label: 'log' }),
    timestamp(),
    myFormat
  ),
  transports: [
    new winston.transports.Console(),
  ]
});

const config = {
  host: process.env.host,
  username: process.env.username,
  password: process.env.password,
  hostUrl: process.env.hostUrl,
  timezoneUtcOffset: process.env.timezoneUtcOffset || '+00:00',
  inactiveMinutesForSleep: parseInt(process.env.inactiveMinutes) || 10,
  motd: process.env.motd || 'Servidor em modo de espera. Tente conectar e espere um pouco para que ele seja religado.',
  disconnectPhrase: process.env.disconnectPhrase || 'O servidor foi acordado do modo de espera e está iniciando, aguarde um momento e tente novamente.',
  serverVersion: '1.19.2',
  token: ''
};
const listening: ServerEntity[] = [];
const serversByPort: {[port: number]: minecraft.Server} = {};

const http = axios.create({
  baseURL: config.hostUrl,
  timeout: 10000,
  httpsAgent: new https.Agent({
    rejectUnauthorized: false,
    requestCert: false,
  })
});
http.interceptors.request.use(function (req) {
  req.headers.Authorization = 'Bearer ' + config.token;
  return req;
});
http.interceptors.response.use(res => {
  if (res && res.data) {
    res.data = camelizeKeys(res.data);
  }
  return res;
});

async function login() {
  const res = await http.post('api/v2/auth/login', {username: config.username, password: config.password});
  config.token = res.data?.data?.token;
}

function retryLogin(cb: () => any) {
  return (err): PromiseLike<any> => {
    const status = err?.response?.status;
    if (status == 403 || status == 401) {
      return login().then(() => cb());
    } else {
      return Promise.reject(err);
    }
  };
}

async function getServers(): Promise<ServerEntity[]> {
  const servers: ServerEntity[] = await http.get('api/v2/servers')
      .then(res => res.data.data)
      .then((res: any[]) => res.map(a => new ServerEntity(a)))
      .catch(retryLogin(() => getServers()));

  for (const s of servers) {
    s.stats = await http.get('api/v2/servers/' + s.serverId + '/stats')
        .then(res => res?.data?.data)
        .then((stats: ServerStats) => {
          // @ts-ignore
          if (stats.started == 'False') {
            stats.started = undefined;
          } else if (stats.started) {
            stats.started = moment.utc(stats.started).utcOffset(config.timezoneUtcOffset);
          }
          return stats;
        });
  }

  return servers;
}

async function startServer(id: number) {
  return http.post('api/v2/servers/' + id + '/action/start_server');
}

async function stopServer(id: number) {
  return http.post('api/v2/servers/' + id + '/action/stop_server');
}

async function check() {
  log.info('Checking servers.');
  const servers = await getServers();
  for (const s of servers) {
    const cs = () => {
      log.info('Server ' + s.serverName + ' is not running, listening for connections on its port.');
      listening.push(s);

      const server = minecraft.createServer({
        'online-mode': false,
        host: '0.0.0.0',
        port: s.serverPort,
        version: config.serverVersion,
        motd: config.motd
      });
      serversByPort[s.serverPort] = server;

      server.once('login', (client) => {
        log.info('Connection found for server ' + s.serverName + ', closing and waking server from sleep.');
        client.end(config.disconnectPhrase);
        server.close();
        startServer(s.serverId).then();

        const idx = listening.findIndex(found => found.serverId === s.serverId);
        if (idx >= 0) {
          listening.splice(idx, 1);
        }
      });
    };

    if (s.stats.running && !s.stats.waitingStart && !!s.stats.started && moment().utc().utcOffset(config.timezoneUtcOffset).diff(s.stats.started, "minute") >= config.inactiveMinutesForSleep && s.stats.online === 0) {
      log.info('No players found on server ' + s.serverName + 'after ' + config.inactiveMinutesForSleep + ' minute timeout, turning off.');
      await stopServer(s.serverId);
      log.info('Done.');
      cs();
    }

    if (!s.stats.running && !listening.some(found => found.serverId === s.serverId)) {
      cs();
    }
  }
}

setInterval(check, 15 * 1000);
check().then();

