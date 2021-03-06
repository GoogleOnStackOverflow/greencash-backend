const functions = require('firebase-functions');
const ECDSA = require('ecdsa-secp256r1/browser');

// The Firebase Admin SDK to access the Firebase Realtime Database.
const admin = require('firebase-admin');
admin.initializeApp();

// verify an id_tkn
const GetUidFromTkn = (tkn) => {
    return admin.auth().verifyIdToken(tkn).then(decodedToken => {
        return decodedToken.uid;
    });
}

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
            return admin.database().ref(`/users/${user}`).child(`transitions`).update({ [`${content.content.time}`]: transition });
        });
}

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

exports.saveByFirebaseTkn = functions.https.onRequest((request, response) => {
    let amount = request.query.amount;
    let usr = request.query.usr;

    if (!amount || !usr) {
        return response.status(400).send('Bad Request');
    }

    return Promise.all([GetUidFromTkn(usr), amount]).then(([uid, amount]) => {
        return  Promise.all([admin.database().ref(`/users/${uid}`).once('value'), uid, amount]);
    }).then(([snapshot, uid, amount]) => {
        if (snapshot && snapshot.val()) {
            return Promise.all([snapshot.val().cash >= amount, uid, amount])
        } else {
            return response.status(403).send('User Not Found');
        }
    }).then(([isValid, uid, amount]) => {
        if (!isValid) {
            return response.status(403).send('Cash not enough');
        } else {
            let tran = {
                original: '',
                counterparty: 'GREENCASH BANK',
                time: (new Date()).getTime(),
                savedcashdelta: amount,
                cashdelta: -1 * amount, 
                rightdelta: 0, 
                roundeddelta: 0
            }

            return admin.database().ref(`/users/${uid}`).child(`transitions`).update({ 
                [`${tran.time}`]: tran });
        }
    }).then(() => {
        return response.status(200).send('OK');
    }).catch(e => {
        return response.status(500).send(e.message);
    });
});

exports.save = functions.https.onRequest((request, response) => {
    let amount = request.query.amount;
    let usr = request.query.usr;

    if (!amount || !usr) {
        return response.status(400).send('Bad Request');
    }

    return Promise.all([admin.database().ref(`/users/${usr}`).once('value'), usr, amount])
    .then(([snapshot, uid, amount]) => {
        if (snapshot && snapshot.val()) {
            return Promise.all([snapshot.val().cash >= amount, uid, amount])
        } else {
            return response.status(403).send('User Not Found');
        }
    }).then(([isValid, uid, amount]) => {
        if (!isValid) {
            return response.status(403).send('Cash not enough');
        } else {
            let tran = {
                original: '',
                counterparty: 'GREENCASH BANK',
                time: (new Date()).getTime(),
                savedcashdelta: amount,
                cashdelta: -1 * amount, 
                rightdelta: 0, 
                roundeddelta: 0
            }

            return admin.database().ref(`/users/${uid}`).child(`transitions`).update({ 
                [`${tran.time}`]: tran });
        }
    }).then(() => {
        return response.status(200).send('OK');
    }).catch(e => {
        return response.status(500).send(e.message);
    });
});

const executeTransition = (user, delta) => {
    return admin.database().ref(`/users/${user}`).once('value', snapshot => {
        let originArr = [];
        if (snapshot && snapshot.val()) {
            let origin = snapshot.val()
            originArr = [origin.recycle, origin.cash, origin.right, origin.saved];
        } else {
            originArr = [0, 0, 0, 0];
        }

        originArr = originArr.map(x => x ? x : 0);
        [recycleBase, cashBase, rightBase, savedBase] = originArr;

        let recycle = recycleBase + delta.recycle;
        let roundDelta = Math.floor(recycle / 8);
        recycle = recycle % 8;
        let cash = cashBase + delta.cash + roundDelta;
        let right = rightBase + delta.right + roundDelta;

        return admin.database().ref(`/users/${user}`).update({
            recycle, cash, right,
            saved: savedBase + delta.saved
        });
    });
}

// execTransition
exports.execTransit = functions.database.ref('/users/{userID}/transitions/{eventTime}').onCreate((snap, context) => {
    let content = snap.val();
    let delta = {
        recycle: content.roundeddelta,
        cash: content.cashdelta,
        right: content.rightdelta,
        saved: content.savedcashdelta
    };

    return executeTransition(context.params.userID, delta);
});