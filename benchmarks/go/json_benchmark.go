package main

import (
	"encoding/json"
	"fmt"
	"strconv"
	"time"
)

type User struct {
	ID     int      `json:"id"`
	Name   string   `json:"name"`
	Email  string   `json:"email"`
	Age    int      `json:"age"`
	Active bool     `json:"active"`
	Tags   []string `json:"tags"`
}

func main() {
	N := 100000

	// Create test objects
	objects := make([]User, N)
	for i := range objects {
		objects[i] = User{
			ID:     i,
			Name:   "User " + strconv.Itoa(i),
			Email:  "user" + strconv.Itoa(i) + "@example.com",
			Age:    20 + (i % 50),
			Active: i%3 != 0,
			Tags:   []string{"tag1", "tag2", "tag3"},
		}
	}

	// JSON marshal benchmark
	start := time.Now()
	strs := make([][]byte, N)
	for i, o := range objects {
		strs[i], _ = json.Marshal(o)
	}
	fmt.Printf("json.Marshal %d objects: %.1fms\n", N, float64(time.Since(start).Microseconds())/1000.0)

	// JSON unmarshal benchmark
	start = time.Now()
	parsed := make([]User, N)
	for i, s := range strs {
		json.Unmarshal(s, &parsed[i])
	}
	fmt.Printf("json.Unmarshal %d objects: %.1fms\n", N, float64(time.Since(start).Microseconds())/1000.0)

	// Large file parse
	bigJson, _ := json.Marshal(objects)
	fmt.Printf("Big JSON size: %dKB\n", len(bigJson)/1024)

	start = time.Now()
	for i := 0; i < 100; i++ {
		var result []User
		json.Unmarshal(bigJson, &result)
	}
	elapsed := float64(time.Since(start).Microseconds()) / 1000.0
	fmt.Printf("json.Unmarshal %dKB x100: %.1fms (%.2fms each)\n", len(bigJson)/1024, elapsed, elapsed/100)
}
