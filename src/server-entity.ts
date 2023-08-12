import * as moment from "moment";

export class ServerEntity {
    serverId: number;
    serverName: string;
    serverPort: number;
    type: 'minecraft-java' | string;
    stats?: ServerStats;

    constructor(init?: Partial<ServerEntity>) {
        Object.assign(this, init);
    }
}

export class ServerStats {
    running: boolean;
    waitingStart: boolean;
    started: moment.Moment;
    online: number;
    desc: string;

    constructor(init?: Partial<ServerStats>) {
        Object.assign(this, init);
    }
}