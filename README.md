# SparkMatch

SparkMatch is a real-time stranger-matching platform that pairs nearby users for instant video calls. Built with an emphasis on speed and connection, it uses geolocation and Haversine distance to prioritize matches within the closest radius via a Socket.IO queue. 

When users connect and mutually "like" each other, a persistent chat is unlocked, enabling ongoing communication through text, voice notes, images, and intentional audio/video calling.

## Features

- **Geolocated Matchmaking:** Uses the Haversine formula to calculate the distance between users, prioritizing matches that are geographically closer.
- **WebRTC P2P Video & Audio:** Delivers low-latency, peer-to-peer video calls using WebRTC with ICE negotiation.
- **Mutual Like System:** Users can anonymously "like" their partner during a random match. If the feeling is mutual, the connection is saved permanently.
- **Persistent Chat:** Unlocked matches gain access to a permanent chat interface supporting text, photo sharing, and voice notes.
- **Direct Calling:** Initiate intentional video or voice calls directly with permanent matches, featuring split-screen and picture-in-picture layout options.
- **Secure Authentication:** Implements JWT-based sessions and bcrypt password hashing for robust security.
- **Optimized Media:** Profile pictures and shared images are automatically compressed on the client-side to save bandwidth and storage.

## Tech Stack

- **Frontend:** Vanilla JavaScript (ES Modules), HTML5, CSS3, WebRTC API, Canvas API (for image compression)
- **Backend:** Node.js, Express.js, Socket.IO
- **Database:** MongoDB (via Mongoose)
- **Authentication:** JSON Web Tokens (JWT), BcryptJS
- **Media Handling:** Multer (for multipart/form-data)

## Local Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/shortcut-jawad/SparkMatch.git
   cd SparkMatch
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory and add the following keys:
   ```env
   MONGO_URI=your_mongodb_connection_string
   JWT_SECRET=your_super_secret_jwt_key
   PORT=3000
   ```

4. **Start the server:**
   ```bash
   npm start
   ```

5. **Open in browser:**
   Navigate to `http://localhost:3000`

## Architecture & Logic

- **Socket.IO Queue:** The server maintains an active waiting queue. When a user joins, the backend iterates through the queue to find the closest available user using latitude and longitude coordinates.
- **WebRTC Signaling:** Socket.IO acts as the signaling server, passing `offer`, `answer`, and `ice-candidate` payloads between peers to establish the direct connection.
- **Persistent Chat Logic:** Once a mutual match occurs, a unique chat room is generated in MongoDB. Socket.IO dynamically routes messages to these specific rooms, saving the history in the database so it can be populated in the chat sidebar upon reconnecting.

## License

ISC
