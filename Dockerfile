FROM cypress/included:13.17.0

WORKDIR /app

ENV NODE_ENV=production \
    CI=1 \
    DBUS_SESSION_BUS_ADDRESS=/dev/null \
    CYPRESS_HEADED=false \
    CYPRESS_BROWSER=chrome

COPY package*.json ./
RUN npm install --include=dev

COPY ui/package*.json ./ui/
RUN cd ui && npm install --include=dev

COPY . .

RUN cd ui && npm run build

EXPOSE 10000

CMD ["node", "render-start.js"]
