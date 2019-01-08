const ECDSA = require('ecdsa-secp256r1');

const machineInfo = {
    id: 'DEMO0001'
};

let qr_str = {
    info: machineInfo,
    recycle: {
        bottle: 7,
        can: 15,
    },
    time: (new Date()).getTime()
};

let privateKey = ECDSA.fromJWK({
    kty: 'EC',
    crv: 'P-256',
    x: 'TBJBm5OHQj2EyMwZosrLNl4-yxu5mf_0AianU0vQGy0',
    y: 'dJioz6Rh6MyeVwPBzQp_xKMjcZRT93Ql9dLDbbFwTsg',
    d: 'ADDkdPByhN0ed3CQR_HsAuVOLe5xKO_34x0NbheRctA'
});

let signature = privateKey.sign(JSON.stringify(qr_str));
let r = JSON.stringify({ content: qr_str, signature });

console.log(`${r}\n`);
console.log(privateKey.asPublic().toCompressedPublicKey());