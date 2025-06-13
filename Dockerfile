# Use official Node.js runtime as a parent image
FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
# Install all dependencies including dev ones so the `tsx` runtime is available
RUN npm install

# Bundle app source
COPY . .

# Expose the port the server listens on
EXPOSE 4001

# Start the server
CMD ["npm", "start"]
