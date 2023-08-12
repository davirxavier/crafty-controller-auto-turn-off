FROM node:18-alpine

WORKDIR /usr/crafty-controller-auto-turn-off-server
COPY . .

RUN npm install
RUN npm run build

ENV host ''
ENV username ''
ENV password ''
ENV hostUrl ''
ENV timezoneUtcOffset ''
ENV inactiveMinutes ''
ENV checkIntervalSeconds ''
ENV motd ''
ENV disconnectPhrase ''
ENV mockServerVersion ''

CMD sh -c "npm run start:prod"