FROM node:14.1-alpine as build-stage

RUN mkdir -p /root/app/
WORKDIR /root/app/

COPY package.json .
COPY yarn.lock .

RUN yarn install

COPY . .

RUN yarn build

# application docker
FROM node:14.1-alpine

RUN mkdir -p /root/app/
WORKDIR /root/app/

COPY --from=build-stage /root/app/build .

ENV NODE_ENV production

EXPOSE 3000
