const IPFS = require("ipfs-api");
const OrbitDB = require("orbit-db");
const uuid = require("uuid/v4");
const bcrypt = require("bcrypt");
const fs = require("fs");
const { exec } = require("child_process");
const Identities = require("orbit-db-identity-provider");

// load all dbs
let filePath = "./dbaddress.js";
let userDb = null;
let contacts = null;
let chats = null;
let conversation = null;
let entity = null;
let entityComm = null;
let ipfs = null;
let notificationPayloadData = null;
let entityPayloadData = null;

async function loadDB() {
  const ipfsOptions = {
    EXPERIMENTAL: {
      pubsub: true,
    },
    relay: {
      enabled: true,
      hop: {
        enabled: true,
        active: true,
      },
    },
    host: "localhost",
    port: "5001",
  };

  // create identity
  const IdOptions = { id: "chatapp-custom-id" };
  var identity = await Identities.createIdentity(IdOptions);

  // Create IPFS instance
  ipfs = new IPFS(ipfsOptions);
  const orbitdb = new OrbitDB(ipfs, identity);

  console.log("loading the databases");
  try {
    //loads all db
    fs.access(filePath, fs.F_OK, async (err) => {
      if (err) {
        // file does not exists
        // create databases and create file
        console.log("Databases does not exists, this is a genesis peer\n");
        console.log("Creating databases and path files\n");
        // create dbs
        userDb = await orbitdb.create("dc.user", "docstore", {
          accessController: {
            write: ["*"],
          },
        });

        contacts = await orbitdb.create("dc.contacts", "docstore", {
          accessController: {
            write: ["*"],
          },
        });

        conversation = await orbitdb.create("dc.conversation", "docstore", {
          accessController: {
            write: ["*"],
          },
        });

        chats = await orbitdb.create("dc.chats", "docstore", {
          accessController: {
            write: ["*"],
          },
        });

        entity = await orbitdb.create("dc.entity", "docstore", {
          accessController: {
            write: ["*"],
          },
        });

        entityComm = await orbitdb.create("dc.entityComm", "docstore", {
          accessController: {
            write: ["*"],
          },
        });

        let fileContents = {
          user: userDb.address.toString(),
          contacts: contacts.address.toString(),
          chats: chats.address.toString(),
          conversation: conversation.address.toString(),
          entity: entity.address.toString(),
          entityComm: entityComm.address.toString(),
        };

        // write the db file
        fs.writeFileSync(filePath, JSON.stringify(fileContents));
        console.log("database peer file created, loading them in memory");
      } else {
        // file exists, load the databases
        let fileData = fs.readFileSync(filePath, "utf-8");
        let config = JSON.parse(fileData);
        console.log("Databases exists, loading them in memory\n");
        userDb = await orbitdb.open(config.user);
        contacts = await orbitdb.open(config.contacts);
        chats = await orbitdb.open(config.chats);
        conversation = await orbitdb.open(config.conversation);
        entity = await orbitdb.open(config.entity);
        entityComm = await orbitdb.open(config.entityComm);
      }

      // load the local store of the data
      userDb.events.on("ready", () => {
        console.log("user database is ready.");
      });

      userDb.events.on(
        "replicate.progress",
        (address, hash, entry, progress, have) => {
          console.log("user database replication is in progress");
        }
      );

      userDb.events.on("replicated", (address) => {
        console.log("user database replication done.");
      });

      contacts.events.on("ready", () => {
        console.log("contacts database is ready.");
      });

      contacts.events.on(
        "replicate.progress",
        (address, hash, entry, progress, have) => {
          console.log("contacts database replication is in progress");
        }
      );

      contacts.events.on("replicated", (address) => {
        console.log("contacts database replication done.");
      });

      chats.events.on("ready", () => {
        console.log("chats database is ready.");
      });

      chats.events.on(
        "replicate.progress",
        (address, hash, entry, progress, have) => {
          notificationPayloadData = null;
          notificationPayloadData = JSON.parse(JSON.stringify(entry));
          console.log("chats database replication is in progress");
        }
      );

      chats.events.on("replicated", (address) => {
        sendNotification(notificationPayloadData.payload.value);
        notificationPayloadData = null;
        console.log("chats databse replication done.");
      });

      conversation.events.on("ready", () => {
        console.log("conversation database is ready.");
      });

      conversation.events.on(
        "replicate.progress",
        (address, hash, entry, progress, have) => {
          console.log("conversation database replication is in progress");
        }
      );

      conversation.events.on("replicated", (address) => {
        console.log("conversation databse replication done.");
      });

      entity.events.on("ready", () => {
        console.log("Entity database is ready.");
      });

      entity.events.on(
        "replicate.progress",
        (address, hash, entry, progress, have) => {
          console.log("Entity database replication is in progress");
        }
      );

      entity.events.on("replicated", (address) => {
        console.log("Entity databse replication done.");
      });

      entityComm.events.on("ready", () => {
        console.log("Entity communication database is ready.");
      });

      entityComm.events.on(
        "replicate.progress",
        (address, hash, entry, progress, have) => {
          console.log(
            "Entity communication database replication is in progress"
          );
          entityPayloadData = null;
          entityPayloadData = JSON.parse(JSON.stringify(entry));
          console.log("chats database replication is in progress");
        }
      );

      entityComm.events.on("replicated", (address) => {
        if (entityPayloadData.payload.value.type === "photo") {
          // this is a reply
          // emit the message
          let entityCommData = entityComm.get(
            entityPayloadData.payload.value._id
          );
          global.io.sockets
            .in(entityPayloadData.payload.value.phone)
            .emit("new_entity_msg", { msg: entityCommData[0] });
          console.log("another event emiitedd");
        } else {
          // this is a request to act on
          // check if we have a entity with this node
          global.entityNode.map((singleEntity) => {
            if (
              singleEntity.entityId === entityPayloadData.payload.value.entityId
            ) {
              // command is for this Node
              // do the needful
              performEntityAction(entityPayloadData.payload.value);
              entityPayloadData = null;
            }
          });
        }
        console.log("Entity communication databse replication done.");
      });

      userDb.load();
      contacts.load();
      chats.load();
      conversation.load();
      entity.load();
      entityComm.load();
    });
  } catch (e) {
    console.log(e);
  }
}

// load the database
loadDB();

async function addUser(requestData) {
  try {
    let id = uuid();
    let password = bcrypt.hashSync(requestData.password, 10);
    let data = {
      _id: id,
      name: requestData.name,
      phone: requestData.phone,
      password: password,
      time: Date.now(),
    };
    let hash = await userDb.put(data);
    let userData = userDb.get(id);
    return {
      error: false,
      hash: hash,
      data: userData[0],
    };
  } catch (e) {
    console.log(e);
    return {
      error: true,
      hash: null,
      data: null,
    };
  }
}

async function login(data) {
  try {
    let userData = await getUserByPhone(data.phone);
    if (bcrypt.compareSync(data.password, userData[0].password)) {
      // correct password
      return {
        error: false,
        data: {
          userId: userData[0]["_id"],
          phone: userData[0]["phone"],
          name: userData[0]["name"],
        },
        message: "user logged in successfully.",
      };
    } else {
      return {
        error: true,
        data: null,
        message: "password does not match",
      };
    }
  } catch (e) {
    return {
      error: true,
      data: null,
      message: "error occurred during login",
    };
  }
}

async function getRecentChat(data) {
  try {
    // check if conversation exists
    let conversationData = conversation.query(
      (doc) => doc._id === data.conversationId
    );
    if (conversationData.length !== 0) {
      let chatData = chats.query(
        (doc) => doc.conversationId === conversationData[0]._id
      );
      return {
        error: false,
        data: chatData,
        message: "Success",
      };
    } else {
      return {
        error: false,
        data: [],
        message: "Success",
      };
    }
  } catch (e) {
    return {
      error: true,
      data: null,
      message: "failure",
    };
  }
}

async function getNetworkMessage() {
  try {
    let chatData = chats.query((doc) => doc.conversationId === "123456789");
    return {
      error: false,
      data: chatData,
      message: "Success",
    };
  } catch (e) {
    return {
      error: true,
      data: null,
      message: "failure",
    };
  }
}

async function createConversation(data) {
  try {
    let conversationData = conversation.query(
      (doc) =>
        doc.participants.indexOf(data.reciever) !== -1 &&
        doc.participants.indexOf(data.sender) !== -1
    );
    if (conversationData.length !== 0) {
      let userData = await getUserByPhone(data.reciever);
      conversationData[0].recieverInfo = userData;
      return {
        error: false,
        data: conversationData,
        message: "Success",
      };
    } else {
      let id = uuid();
      let conversationPayload = {
        _id: id,
        participants: [data.sender, data.reciever],
        time: Date.now(),
      };
      let hash = await conversation.put(conversationPayload);
      let finalData = conversation.get(id);
      let userData = await getUserByPhone(data.reciever);
      finalData[0].recieverInfo = userData;
      return {
        error: false,
        data: finalData,
        message: "Success",
      };
    }
  } catch (e) {
    return {
      error: true,
      data: null,
      message: "failure",
    };
  }
}

async function getConversation(data) {
  try {
    let conversationData = conversation.query((doc) => doc._id === data.id);
    if (conversationData.length > 0) {
      let participants = conversationData[0].participants.slice();
      participants.splice(participants.indexOf(data.sender), 1);
      let userData = await getUserByPhone(participants[0]);
      conversationData[0].recieverInfo = userData;
    }
    return {
      error: false,
      data: conversationData,
      message: "Success",
    };
  } catch (e) {
    return {
      error: true,
      data: null,
      message: "failure",
    };
  }
}

async function getRecentConversation(data) {
  try {
    let conversationData = conversation.query(
      (doc) => doc.participants.indexOf(data.sender) !== -1
    );
    if (conversationData.length > 0) {
      conversationData.forEach(async (singleConversation) => {
        let participants = singleConversation.participants.slice();
        participants.splice(participants.indexOf(data.sender), 1);
        let userData = await getUserByPhone(participants[0]);
        singleConversation.recieverInfo = userData;
      });
    }
    return {
      error: false,
      data: conversationData,
      message: "Success",
    };
  } catch (e) {
    return {
      error: true,
      data: null,
      message: "failure",
    };
  }
}

async function crossCheckContacts(contactList) {
  try {
    var userContacts = [];
    contactList.map(async (singleContact) => {
      let contactData = userDb.query((doc) => doc.phone === singleContact);
      if (contactData.length !== 0) {
        userContacts.push({
          name: contactData[0].name,
          phone: contactData[0].phone,
          profile: contactData[0],
          isContact: true,
        });
      }
    });
    return {
      error: false,
      data: userContacts,
      message: "Success",
    };
  } catch (e) {
    return {
      error: true,
      data: null,
      message: "failure",
    };
  }
}

async function createChat(chatData) {
  try {
    let id = uuid();
    var payload = null;
    if (chatData.type === "text") {
      payload = {
        _id: id,
        conversationId: chatData.conversationId,
        sender: chatData.sender,
        reciever: chatData.reciever,
        body: chatData.message,
        type: chatData.type,
        isBot: chatData.isBot ? true : false,
        time: Date.now(),
      };
    } else {
      // add file in the IPFS
      let systemPath = __dirname + "/" + chatData.filePath;
      let fileObject = fs.readFileSync(systemPath);
      let fileBuffer = Buffer.from(fileObject);
      let ipfsLocation = await addIPFSObject(fileBuffer);
      payload = {
        _id: id,
        conversationId: chatData.conversationId,
        sender: chatData.sender,
        reciever: chatData.reciever,
        body: null,
        type: chatData.type,
        systemPath: systemPath,
        ipfsPath: ipfsLocation[0].path,
        isBot: chatData.isBot ? true : false,
        time: Date.now(),
      };
    }
    let hash = await chats.put(payload);
    return {
      error: false,
      data: payload,
      message: "Success",
    };
  } catch (e) {
    return {
      error: true,
      data: null,
      message: "failure",
    };
  }
}

async function createEntity(requestData) {
  try {
    let id = uuid();
    let data = {
      _id: id,
      name: requestData.name,
      time: Date.now(),
    };
    let hash = await entity.put(data);
    let entityData = entity.get(id);
    return {
      error: false,
      hash: hash,
      data: entityData[0],
    };
  } catch (e) {
    console.log(e);
    return {
      error: true,
      hash: null,
      data: null,
    };
  }
}

async function listEntity() {
  try {
    let entityData = entity.query((doc) => doc);
    return {
      error: false,
      data: entityData,
      message: "Success",
    };
  } catch (e) {
    return {
      error: true,
      data: null,
      message: "failure",
    };
  }
}

async function createEntityCommunication(requestData) {
  try {
    let id = uuid();
    var payload = null;
    if (requestData.type === "text") {
      payload = {
        _id: id,
        entityId: requestData.entityId,
        phone: requestData.phone,
        name: requestData.userName,
        type: requestData.type,
        message: requestData.message,
        time: Date.now(),
      };
    } else {
      let systemPath = requestData.filePath;
      let fileObject = fs.readFileSync(systemPath);
      let fileBuffer = Buffer.from(fileObject);
      let ipfsLocation = await addIPFSObject(fileBuffer);
      payload = {
        _id: id,
        entityId: requestData.entityId,
        phone: requestData.phone,
        name: requestData.userName,
        type: requestData.type,
        message: null,
        systemPath: systemPath,
        ipfsPath: ipfsLocation[0].path,
        time: Date.now(),
      };
    }
    let hash = await entityComm.put(payload);
    let entityCommData = entityComm.get(id);

    // check if the command is for this node itself
    if (requestData.type === "text") {
      global.entityNode.map((singleEntity) => {
        if (singleEntity.entityId === requestData.entityId) {
          // command is for this Node
          // do the needful
          performEntityAction(entityCommData[0]);
        }
      });
    }
    return {
      error: false,
      hash: hash,
      data: entityCommData[0],
    };
  } catch (e) {
    console.log(e);
    return {
      error: true,
      hash: null,
      data: null,
    };
  }
}

async function listEntityCommunication(data) {
  try {
    let entityCommData = entityComm.query(
      (doc) => doc.phone === data.phone && doc.entityId === data.entityId
    );
    return {
      error: false,
      data: entityCommData,
      message: "Success",
    };
  } catch (e) {
    return {
      error: true,
      data: null,
      message: "failure",
    };
  }
}

async function updateUserInfo(payload) {
  try {
    let userData = await getUserByPhone(payload.phone);
    if (payload.path) {
      // profile photo coming
      let systemPath = __dirname + "/" + payload.path;
      let fileObject = fs.readFileSync(systemPath);
      let fileBuffer = Buffer.from(fileObject);
      let ipfsLocation = await addIPFSObject(fileBuffer);
      userData[0].profilePhoto = ipfsLocation[0].path;
    }
    userData[0].name = payload.name;
    userData[0].status = payload.status;
    let hash = userDb.put(userData[0]);
    return {
      error: false,
      data: [],
      message: "Success",
    };
  } catch (e) {
    return {
      error: true,
      data: null,
      message: "failure",
    };
  }
}

async function addIPFSObject(bufferData) {
  return new Promise((resolve, reject) => {
    ipfs.files.add(bufferData, (err, file) => {
      if (err) {
        reject(err);
      }
      resolve(file);
    });
  });
}

async function getUserInfo(phone) {
  let data = await getUserByPhone(phone);
  return data;
}

async function getUserByPhone(phone) {
  let data = userDb.query((doc) => doc.phone === phone);
  return data;
}

async function checkUser(data) {
  try {
    let userData = await getUserByPhone(data.phone);
    if (userData.length == 0) {
      return {
        error: false,
        data: null,
        message: "user does not exists.",
      };
    } else {
      // email present
      return {
        error: true,
        data: null,
        message: "user already exists.",
      };
    }
  } catch (e) {
    return {
      error: true,
      data: null,
      message: "error occurred during user check.",
    };
  }
}
async function sendNotification(notificationData) {
  try {
    let data = await chats.get(notificationData._id);
    if (notificationData.conversationId === "123456789") {
      // its from network
      console.log("emit network message");
      global.io.emit("new_network_msg", { msg: data[0] });
    } else {
      global.io.sockets.in(data[0].reciever).emit("new_msg", { msg: data[0] });
    }
  } catch (e) {
    return {
      error: true,
      data: null,
      message: "error occurred during user check.",
    };
  }
}

async function performEntityAction(entityActionData) {
  try {
    // execute python script to take photo
    // add photo in the IPFS
    // create new entity communication
    // emit the socket event to the reciever
    let filePath = `/home/amitmishra/Graminno/grammino-chat-backend/uploads/${uuid()}.jpg`;
    exec(
      `fswebcam -r 320x240 -S 3 --jpeg 50 --save ${filePath}`,
      async (err, stdout, stderr) => {
        if (err) {
          console.error(`exec error: ${err}`);
          throw err;
        }
        console.log("photo taken");
        // adding into IPFS
        let systemPath = filePath;
        let fileObject = fs.readFileSync(systemPath);
        let fileBuffer = Buffer.from(fileObject);
        let ipfsLocation = await addIPFSObject(fileBuffer);
        console.log(ipfsLocation);
        let id = uuid();
        let payload = {
          _id: id,
          entityId: entityActionData.entityId,
          phone: entityActionData.phone,
          name: entityActionData.name,
          type: "photo",
          message: null,
          systemPath: systemPath,
          ipfsPath: ipfsLocation[0].path,
          time: Date.now(),
        };
        let hash = await entityComm.put(payload);
        let entityCommData = entityComm.get(id);

        console.log(entityCommData);
        // if user connected to the same node, emit the reply
        global.io.sockets
          .in(entityActionData.phone)
          .emit("new_entity_msg", { msg: entityCommData[0] });
        console.log("new_entity_msg event emitted");
      }
    );
  } catch (e) {
    return {
      error: true,
      data: null,
      message: "error occurred during entity action.",
    };
  }
}

module.exports = {
  addUser: addUser,
  login: login,
  checkUser: checkUser,
  getRecentChat: getRecentChat,
  createConversation: createConversation,
  getRecentConversation: getRecentConversation,
  crossCheckContacts: crossCheckContacts,
  createChat: createChat,
  getConversation: getConversation,
  updateUserInfo: updateUserInfo,
  getUserInfo: getUserInfo,
  getNetworkMessage: getNetworkMessage,
  createEntity: createEntity,
  createEntityCommunication: createEntityCommunication,
  listEntity: listEntity,
  listEntityCommunication: listEntityCommunication,
};
