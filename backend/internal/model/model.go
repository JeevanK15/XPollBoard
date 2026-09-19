package model

import "go.mongodb.org/mongo-driver/bson/primitive"

type User struct {
	ID           primitive.ObjectID `bson:"_id,omitempty"`
	Name         string             `bson:"name"`
	Email        string             `bson:"email"`
	PasswordHash string             `bson:"passwordHash"`
	PollsCreated int64              `bson:"pollsCreated"`
}

type Option struct {
	ID    string `bson:"id" json:"id"`
	Text  string `bson:"text" json:"text"`
	Votes int64  `bson:"votes" json:"votes"`
}

type Comment struct {
	ID        string `bson:"id" json:"id"`
	UserName  string `bson:"userName" json:"userName"`
	Message   string `bson:"message" json:"message"`
	CreatedAt int64  `bson:"createdAt" json:"createdAt"`
}

type Poll struct {
	ID            primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	OwnerID       primitive.ObjectID `bson:"ownerId" json:"-"`
	ShareID       string             `bson:"shareId" json:"shareId"`
	Question      string             `bson:"question" json:"question"`
	Options       []Option           `bson:"options" json:"options"`
	Active        bool               `bson:"active" json:"active"`
	CreatedAt     int64              `bson:"createdAt" json:"createdAt"`
	Template      string             `bson:"template" json:"template"`
	Visibility    string             `bson:"visibility" json:"visibility"`
	InviteCode    string             `bson:"inviteCode,omitempty" json:"inviteCode,omitempty"`
	PasswordHash  string             `bson:"passwordHash,omitempty" json:"-"`
	AllowComments bool               `bson:"allowComments" json:"allowComments"`
	Comments      []Comment          `bson:"comments,omitempty" json:"comments,omitempty"`
	Reactions     map[string]int64   `bson:"reactions,omitempty" json:"reactions,omitempty"`
	IsOwner       bool               `bson:"-" json:"isOwner"`
}
