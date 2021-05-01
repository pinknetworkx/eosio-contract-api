FROM node:14-alpine

RUN adduser --disabled-password application && \
  mkdir -p /home/application/app/ && \
  chown -R application:application /home/application

USER application

WORKDIR /home/application/app

COPY yarn.lock .
COPY package.json .

RUN yarn install --ignore-scripts

COPY . .

RUN yarn install

ENV NODE_ENV production
EXPOSE 9000
