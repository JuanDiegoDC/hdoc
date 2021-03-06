var app = require('express')();
var server = require('http').Server(app);
var path = require("path");
var io = require('socket.io')(server);
import express from "express";
import mongoose from "mongoose";
import User from "./User.js";
import Document from "./Document.js";
import bodyParser from "body-parser";
const bcrypt = require('bcrypt');
const saltRounds = 10;
var session = require('express-session');
var MongoDBStore = require('connect-mongodb-session')(session);
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
app.use(bodyParser.json());
var store = new MongoDBStore({
  uri: process.env.MONGODB_URI,
  collection: "sessions"
})
app.use(session({
  secret: process.env.SECRET,
  store: store
}));

app.use(express.static(path.join(__dirname)));

mongoose.connect(process.env.MONGODB_URI, {useNewUrlParser: true}, (error) => {
  if(error){
    console.log(error);
  }
  else {
    console.log("Success, connected to MongoDB");
  }
});

passport.use(new LocalStrategy(
  function(username, password, done) {
    User.findOne({ username: username }, function (err, user) {
      if (err) { return done(err); }
      if (!user) {
        return done(null, false, { message: 'Incorrect username.' });
      }
      bcrypt.compare(password, user.password).then(function(res) {
          if (res) {
            return done(null, user);
          }
          else {
            return done(null, false);
          }
      });
    });
  }
));

// session configuration
passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});

// connect passport to express via express middleware
app.use(passport.initialize());
app.use(passport.session());

app.post("/register", (req, res) => {
  const {username, password, passwordconfirm, email} = req.body;
  if (password === passwordconfirm) {
    if (password && username && email) {
      bcrypt.hash(password, saltRounds).then(function(hash) {
        console.log(hash);
        const newUser = new User({
          username: username,
          password: hash,
          email: email
        });
        newUser.save().then((user) => {
          if (!user){
            res.status(500).json({
              error: "Failed to save user"
            });
          }
          else {
            res.status(200).json({
              success: true
            });
          }
        });
      });
    }
  }
  else {
    res.json({
      error: "Password must match"
    });
  }
});

app.post("/ping", (req, res) => {
  res.send("Pong!");
})

app.get("/ping", (req, res) => {
  res.send("Pong!");
});

app.post('/login',
function(req, res, next) {
  passport.authenticate('local', function(err, user, info) {
    if (err) { return next(err);}
    if (!user) {
      return res.json({
        error: "No user in database"
      });
    }
    req.logIn(user, function(err) {
      if (err) {
        return res.json({
          error: err
        });
      }
      else {
        res.json({
          success: true,
          user: user
        });
      }
    });
  })(req, res, next);
});

  app.post("/create/document", (req, res) => {
    if (!req.user) {
      res.json({
        error: "unauthorized"
      });
    }
    else {
      const {title, password} = req.body;
      console.log(title, password);
      const owner = req.user._id;
      if (title && password) {
        const newDoc = new Document({
          title: title,
          password: password,
          owner: owner,
          collaborators: [owner],
          content: ""
        });
        newDoc.save()
        .then((doc) => {
          if (!doc) {
            res.json({
              error: "Failed to save document"
            });
          }
          else {
            res.json({
              success: true,
              id: doc._id
            });
          }
        });
      }
      else {
        res.json({
          error: "Missing parameters"
        })
      }
    }
  });

  app.post("/document", (req, res) => {
    if (!req.user) {
      res.json({
        error: "Unauthorized"
      });
    }
    else {
      const {id} = req.body;
      Document.findOne(id)
        .then((error, doc) => {
          if(error) {
            console.log(error);
            res.json({
              error: "Failed to retrieve document"
            });
          }
          else {
            res.json({
              doc: doc
            });
          }
        })
    }
  });

  app.get("/documents", (req, res) => {
    if (!req.user) {
      res.json({
        error: "Unauthorized"
      });
    }
    else {
      Document.find({}, (error, docs) => {
        if (error){
          console.log(error);
        }
        res.json({
          success: true,
          docs: docs
        });
      });
    }
  });

  app.get("/logout", (req, res) => {
    req.logout();
    res.json({
      success: true
    });
  });

  app.post("/add/collaborator", (req, res) => {
    console.log('/add/collaborator')
    if (!req.user) {
      res.json({
        error: "Unauthorized"
      });
    }
    else {
      const userId = req.user._id;
      const password = req.body.password;
      const docId = req.body.docId;
      console.log(password);
      console.log(docId);
      Document.findById(docId, (error, doc) => {
        if (error){
          console.log(error);
          res.json({
            error: "Error finding document"
          });
        }
        else {
          console.log("Doc collabs before: ", doc.collaborators);
          doc.collaborators.push(userId);
          console.log("Doc collabs after:", doc.collaborators);
          if (String(password) === String(doc.password)) {
            Document.findByIdAndUpdate(docId, {collaborators: doc.collaborators}, (error) => {
              if (error) {
                console.log(error)
              }
              res.json({
                success: true
              });
            });
          }
          else {
            res.json({
              error: "Invalid password"
            });
          }
        }
      });
    }
  });

  app.post("/access/document", (req, res) => {
    console.log('/access/document')
    if (!req.user) {
      res.json({
        error: "Unauthorized"
      });
    }
    else {
      const userId = req.user._id;
      const docId = req.body.docId;
      console.log(userId, docId);
      Document.findById(docId, (error, doc) => {
        if(error) {
          console.log(error);
          res.status(500).json({
            error: "Could not retrieve document"
          });
        }
        else {
          let access = false;
          doc.collaborators.forEach((item) => {
            if (String(item) === String(userId)) {
              access = true;
            }
          });
          res.json({
            success: true,
            access: access
          });
        }
      });
    }
  });

  app.get("/delete/document/:id", (req, res) => {
    if (!req.user) {
      res.json({
        error: "Unauthorized"
      });
    }
    else {
      const docId = req.params.id;
      Document.findById(docId, (error, doc) => {
        if(error){
          console.log(error);
          res.json({
            error: "Could not find document"
          });
        }
        else {
          if (String(req.user._id) === String(doc.owner)) {
            Document.findByIdAndDelete(docId)
              .then((error) => {
                if(error) {
                  console.log(error);
                  res.json({
                    error: "Could not delete document"
                  });
                }
                else {
                  success: true
                }
              })
          }
          else {
            res.json({
              error: "Unauthorized to delete document"
            });
          }
        }
      });
    }
  });

  app.post("/save/document", (req, res) => {
    if (!req.user) {
      res.json({
        error: "Unauthorized"
      });
    }
    else {
      const {content, id, inlineStyles} = req.body;
      console.log("Save document, Content:", content, "id: ", id, "inlineStyles:", inlineStyles);
      Document.findByIdAndUpdate(id, {content: content, inlineStyles: inlineStyles})
        .then((doc) => {
          if (!doc) {
            res.json({
              error: "Could not save"
            });
          }
          else {
            console.log("Saved doc:", doc);
            res.json({
              success: true,
              doc: doc
            });
          }
        });
    }
  });

  io.on('connection', (socket) => {
    let documents = [];

    socket.on('join', (data) => {
      socket.join(data.docId);
      console.log('Joined document.');
      documents.push(data.docId);
      console.log(documents);
      })

    socket.on('leave', (data) => {
      documents.forEach((docId) => {
        if (docId === data.docId) {
          socket.leave(data.docId);
          console.log('\nLeft room.\n');
        }
      })
    })

    socket.on('editorChange', (data) => {
      console.log('editor change', data);
      socket.broadcast.to(data.docId).emit('editorChange', data);
    })
  });

server.listen(8080);
