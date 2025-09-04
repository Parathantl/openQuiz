package services

import (
	"encoding/json"
	"log"
	"strings"
	"sync"
	"time"

	"openquiz/models"

	"github.com/gorilla/websocket"
)

type Hub struct {
	clients     map[*Client]bool
	broadcast   chan []byte
	register    chan *Client
	unregister  chan *Client
	mutex       sync.RWMutex
	gameService *GameService // Add reference to game service
}

type Client struct {
	hub        *Hub
	id         string
	socket     *websocket.Conn
	send       chan []byte
	gamePin    string
	playerID   uint
	playerName string
}

type Message struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

func NewHub(gameService *GameService) *Hub {
	return &Hub{
		clients:     make(map[*Client]bool),
		broadcast:   make(chan []byte),
		register:    make(chan *Client),
		unregister:  make(chan *Client),
		gameService: gameService,
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mutex.Lock()
			h.clients[client] = true
			h.mutex.Unlock()
			log.Printf("Client registered: %s for game %s (player %d: %s) - Total clients: %d", client.id, client.gamePin, client.playerID, client.playerName, len(h.clients))

		case client := <-h.unregister:
			h.mutex.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
				log.Printf("Client unregistered: %s for game %s (player %d: %s) - Total clients: %d", client.id, client.gamePin, client.playerID, client.playerName, len(h.clients))

				// Check if creator disconnected and update game status
				if client.playerID == 0 {
					log.Printf("Creator disconnected from game %s", client.gamePin)
					// Update game status to finished if creator left
					if h.gameService != nil {
						if err := h.gameService.UpdateGameStatus(client.gamePin, "finished"); err != nil {
							log.Printf("Error updating game status after creator disconnect: %v", err)
						} else {
							// Broadcast game end to remaining players
							h.BroadcastToGame(client.gamePin, "game_end", map[string]interface{}{
								"message": "Quiz creator has left the game. The quiz has ended.",
								"reason":  "creator_disconnected",
							})
						}
					}
				}
			}
			h.mutex.Unlock()

		case message := <-h.broadcast:
			h.mutex.RLock()
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(h.clients, client)
				}
			}
			h.mutex.RUnlock()
		}
	}
}

func (h *Hub) BroadcastToGame(gamePin string, messageType string, payload interface{}) {
	message := Message{
		Type:    messageType,
		Payload: payload,
	}

	data, err := json.Marshal(message)
	if err != nil {
		log.Printf("Error marshaling message: %v", err)
		return
	}

	log.Printf("Broadcasting %s to game %s", messageType, gamePin)

	h.mutex.RLock()
	clientCount := 0
	totalClients := 0
	for client := range h.clients {
		totalClients++
		// Use case-insensitive comparison for game pins
		if strings.EqualFold(client.gamePin, gamePin) {
			log.Printf("Found client %s for game %s (player %d: %s)", client.id, gamePin, client.playerID, client.playerName)
			select {
			case client.send <- data:
				clientCount++
				log.Printf("Successfully sent message to client %s (player %d)", client.id, client.playerID)
			default:
				log.Printf("Client %s (player %d) send buffer full, closing connection", client.id, client.playerID)
				close(client.send)
				delete(h.clients, client)
			}
		}
	}
	h.mutex.RUnlock()

	log.Printf("Message sent to %d clients in game %s (total clients: %d)", clientCount, gamePin, totalClients)

	// Debug: List all clients if we're not sending to all expected clients
	if clientCount < 3 { // Assuming we expect 3 clients (host + 2 players)
		h.ListAllClients()
	}
}

func (h *Hub) BroadcastPlayerUpdate(gamePin string, player models.Player, action string) {
	message := Message{
		Type: "player_update",
		Payload: map[string]interface{}{
			"action": action, // "joined" or "left"
			"player": player,
		},
	}

	data, err := json.Marshal(message)
	if err != nil {
		log.Printf("Error marshaling player update message: %v", err)
		return
	}

	h.mutex.RLock()
	for client := range h.clients {
		// Use case-insensitive comparison for game pins
		if strings.EqualFold(client.gamePin, gamePin) {
			select {
			case client.send <- data:
			default:
				close(client.send)
				delete(h.clients, client)
			}
		}
	}
	h.mutex.RUnlock()
}

func (h *Hub) SendGameStateSync(client *Client, gameStatus string, currentQuestionIndex int, currentQuestion interface{}) {
	// Always try to get the actual game state from the service first
	if h.gameService != nil {
		gameState, err := h.gameService.GetCurrentGameState(client.gamePin)
		if err == nil {
			// Use the actual game state from the service
			message := Message{
				Type: "game_state_sync",
				Payload: map[string]interface{}{
					"game_status":            gameState.Status,
					"current_question_index": gameState.CurrentQuestionIndex,
					"current_question":       gameState.CurrentQuestion,
					"players":                gameState.Players,
				},
			}

			data, err := json.Marshal(message)
			if err != nil {
				log.Printf("Error marshaling game state sync message: %v", err)
				return
			}

			log.Printf("Sending actual game state sync to client %s: status=%s, question=%d", client.id, gameState.Status, gameState.CurrentQuestionIndex)

			select {
			case client.send <- data:
			default:
				close(client.send)
				delete(h.clients, client)
			}
			return
		} else {
			log.Printf("Error getting game state for client %s: %v", client.id, err)
		}
	}

	// Fallback to basic state sync if game service is not available or fails
	message := Message{
		Type: "game_state_sync",
		Payload: map[string]interface{}{
			"game_status":            gameStatus,
			"current_question_index": currentQuestionIndex,
			"current_question":       currentQuestion,
		},
	}

	data, err := json.Marshal(message)
	if err != nil {
		log.Printf("Error marshaling game state sync message: %v", err)
		return
	}

	log.Printf("Sending fallback game state sync to client %s: status=%s, question=%d", client.id, gameStatus, currentQuestionIndex)

	select {
	case client.send <- data:
	default:
		close(client.send)
		delete(h.clients, client)
	}
}

func (h *Hub) GetConnectedPlayers(gamePin string) []uint {
	h.mutex.RLock()
	defer h.mutex.RUnlock()

	var playerIDs []uint
	for client := range h.clients {
		// Use case-insensitive comparison for game pins
		if strings.EqualFold(client.gamePin, gamePin) {
			playerIDs = append(playerIDs, client.playerID)
		}
	}
	return playerIDs
}

// ListAllClients lists all connected clients for debugging
func (h *Hub) ListAllClients() {
	h.mutex.RLock()
	defer h.mutex.RUnlock()

	log.Printf("=== Current Hub Status ===")
	log.Printf("Total clients connected: %d", len(h.clients))

	gameClients := make(map[string][]*Client)
	for client := range h.clients {
		gameClients[client.gamePin] = append(gameClients[client.gamePin], client)
	}

	for gamePin, clients := range gameClients {
		log.Printf("Game %s: %d clients", gamePin, len(clients))
		for _, client := range clients {
			log.Printf("  - Client %s: Player %d (%s)", client.id, client.playerID, client.playerName)
		}
	}
	log.Printf("========================")
}

func (h *Hub) IsPlayerConnected(gamePin string, playerID uint) bool {
	h.mutex.RLock()
	defer h.mutex.RUnlock()

	for client := range h.clients {
		// Use case-insensitive comparison for game pins
		if strings.EqualFold(client.gamePin, gamePin) && client.playerID == playerID {
			return true
		}
	}
	return false
}

func (h *Hub) IsCreatorConnected(gamePin string) bool {
	h.mutex.RLock()
	defer h.mutex.RUnlock()

	// Check if there's a creator (player ID 0) connected for this game
	for client := range h.clients {
		// Use case-insensitive comparison for game pins
		if strings.EqualFold(client.gamePin, gamePin) && client.playerID == 0 {
			return true
		}
	}
	return false
}

func (h *Hub) RegisterClient(conn *websocket.Conn, gamePin string, playerID uint, playerName string) *Client {
	client := &Client{
		hub:        h,
		id:         generateClientID(),
		socket:     conn,
		send:       make(chan []byte, 256),
		gamePin:    gamePin,
		playerID:   playerID,
		playerName: playerName,
	}

	h.register <- client

	go client.writePump()
	go client.readPump()

	return client
}

func (h *Hub) UnregisterClient(client *Client) {
	h.unregister <- client
}

func (c *Client) readPump() {
	defer func() {
		c.hub.UnregisterClient(c)
		c.socket.Close()
	}()

	for {
		_, message, err := c.socket.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket read error: %v", err)
			}
			break
		}

		// Handle incoming message
		var msg Message
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Printf("Error unmarshaling message: %v", err)
			continue
		}

		// Process message based on type
		c.handleMessage(msg)
	}
}

func (c *Client) writePump() {
	defer func() {
		c.socket.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			if !ok {
				c.socket.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.socket.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}

			w.Write(message)

			if err := w.Close(); err != nil {
				return
			}
		}
	}
}

func (c *Client) handleMessage(msg Message) {
	switch msg.Type {
	case "ping":
		// Respond with pong
		response := Message{
			Type:    "pong",
			Payload: "pong",
		}
		data, _ := json.Marshal(response)
		c.send <- data

	case "join_game":
		// Handle player joining game
		log.Printf("Player %d (%s) joined game %s via WebSocket", c.playerID, c.playerName, c.gamePin)
		// Send game state sync to the joining player
		c.hub.SendGameStateSync(c, "", 0, nil)

	case "leave_game":
		// Handle player leaving game
		log.Printf("Player %d (%s) left game %s via WebSocket", c.playerID, c.playerName, c.gamePin)

	case "player_ready":
		// Player is ready, send current game state
		log.Printf("Player %d (%s) ready in game %s via WebSocket", c.playerID, c.playerName, c.gamePin)
		c.hub.SendGameStateSync(c, "", 0, nil)

	case "request_game_state":
		// Player is requesting current game state
		log.Printf("Player %d (%s) requesting game state for game %s via WebSocket", c.playerID, c.playerName, c.gamePin)
		c.hub.SendGameStateSync(c, "", 0, nil)

	default:
		log.Printf("Unknown message type: %s from player %d (%s) in game %s", msg.Type, c.playerID, c.playerName, c.gamePin)
	}
}

func generateClientID() string {
	// Simple client ID generation
	return "client_" + string(rune(time.Now().UnixNano()))
}
