# Use official Node.js runtime as a parent image
FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install --production

# Bundle app source
COPY . .

# Expose the port the server listens on
EXPOSE 44361

# Start the server
CMD ["npm", "start"]
