# First stage: compile things.
FROM node:14 AS Build

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./
RUN npm install -g npm
RUN npm i

# Copy the rest of the application
COPY * ./

# Creates assets in ./build
ENV NODE_ENV=production

# Compile server Typescript
RUN npx tsc  --build ./tsconfig.json

# Second stage: run things.
FROM node:14
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install -g npm
RUN npm i --production

# Copy compiled typescript server
COPY --from=build /usr/src/app/out out

ENV NODE_ENV=production

EXPOSE 3000
CMD [ "node", "out/index" ]