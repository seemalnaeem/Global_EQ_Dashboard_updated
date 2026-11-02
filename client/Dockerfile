FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY src ./src
COPY index.html vite.config.js ./
EXPOSE 5177
CMD ["npm", "run", "dev"]
