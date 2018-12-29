const functions = require('firebase-functions');
const ECDSA = require('ecdsa-secp256r1/browser');

// The Firebase Admin SDK to access the Firebase Realtime Database.
const admin = require('firebase-admin');
/*
const config = {
    apiKey: "AIzaSyDwzuyK5F6qchMcstlWLx6zsopw-MCqKeA",
    authDomain: "greencash-demo.firebaseapp.com",
    databaseURL: "https://greencash-demo.firebaseio.com",
    projectId: "greencash-demo",
    storageBucket: "greencash-demo.appspot.com",
    messagingSenderId: "998374524235"
}
*/
admin.initializeApp();

// Content example
/*
    {
        "content":"{\
            "info\": {
                \"log\":121.56878,
                \"lat\":25.03452,
                \"name\":\"GreenCash Demo No.0001\",
                \"id\":\"DEMO0001\"
            },
            \"content\":{
                \"bottle\":1,
                \"can\":2
            },
            \"time\":1545663734706
        }","signature":
            "IuLg6SFSxK6jYeK8u+aLT9pRm7zl3dS2UItMGYn4GrmF70/2USULKDaW9ugDdFjaIOy4OegyI92gg033wDpm9A=="
    }
*/
const DepositeTrans = (original) => {
    console.log(JSON.stringify(original));
    let recycle = original.content.recycle.can + original.content.recycle.bottle;
    let cashdelta = Math.floor(recycle / 8);
    let roundeddelta = recycle % 8;
    let rightdelta = cashdelta;
    return {
        original: JSON.stringify(original),
        counterparty: original.content.info.id,
        time: (new Date()).getTime(),
        savedcashdelta: 0,
        cashdelta, rightdelta, roundeddelta
    }
}


const contentBelongs = (content, usr) => {
    return Promise.all([admin.database().ref(`/contents/${content.content.info.id}/${content.content.time}`).once('value'), content, usr]);
}

const verifyContent = (content) => {
    return admin.database().ref(`/recyclers/${content.content.info.id}/key`).once('value', snapshot => {
        if (!snapshot || !snapshot.val()) {
            return false;
        }

        return ECDSA.fromCompressedPublicKey(snapshot.val()).then(publicKey => {
            return publicKey.verify(content.content, content.signature);
        });
    });
}

const deposite = (content, user) => {
    // Generate the transition object
    let transition = DepositeTrans(content);

    // Add content to used content list
    return admin.database().ref(`/contents/${content.content.info.id}`).update({ [`${content.content.time}`]: user })
        .then(() => {
            return admin.database().ref(`/users/${user}`).child(`transitions`).update({[`${content.content.time}`]: transition});
        });
}

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
exports.deposite = functions.https.onRequest((request, response) => {
    let content = request.query.content;
    let usr = request.query.usr;

    if (!content || !usr) {
        return response.status(400).send('Bad Request');
    }

    content = JSON.parse(content);
    return contentBelongs(content, usr).then(([exists, content, usr]) => {
        if (exists.exists()) {
            return response.status(403).send('USED');
        } else {
            return Promise.all([verifyContent(content), content, usr]);
        }
    }).then(([isValid, content, usr]) => {
        if (!isValid) {
            return response.status(403).send('INVALID');
        } else {
            return deposite(content, usr);
        }
    }).then(() => {
        return response.status(200).send('OK');
    }).catch(e => {
        return response.status(500).send(e.message);
    });
});