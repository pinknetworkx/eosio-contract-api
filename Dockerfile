FROM node:14.4-alpine

RUN adduser --disabled-password application && \
  mkdir -p /home/application/app/ && \
  chown -R application:application /home/application

USER application
WORKDIR /home/application/app

COPY . .

RUN yarn install

EXPOSE 9000
