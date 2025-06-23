# Use official Node.js LTS version 
FROM node:18-slim

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Optionally disable strict SSL (if behind proxy or using self-signed certs)
RUN npm config set strict-ssl false

# Set Node.js environment variable (not an npm config!)
ENV NODE_TLS_REJECT_UNAUTHORIZED=0

# Install dependencies
RUN npm install

# Copy remaining app code
COPY . .

# Expose application port
EXPOSE 3000

# Start your app (adjust as needed)
CMD ["npm", "run", "dev"]
