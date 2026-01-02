# Use a lightweight Node.js image
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package files first (This optimizes build speed via caching)
COPY package*.json ./

# Install dependencies
RUN npm install

#  Copy the rest of code
COPY . .

# Expose the port your app runs on
EXPOSE 5000

# Start the app
CMD ["npm", "run", "dev"]