const config = require("./config");
const express = require("express");
const app = express();
const lnService = require("ln-service");
const BN = require("bn.js");
const harmony = require("./harmony");

// connect to lnd
const { lnd } = lnService.authenticatedLndGrpc({
  cert: config.cert,
  macaroon: config.macaroon,
  socket: config.socket,
});

app.use(express.json()).post("/", async (req, res) => {
  const { bitcoin, toAddress } = req.body;

  // create bitcoin invoice
  const invoice = await lnService.createInvoice({
    lnd,
    tokens: new BN(bitcoin * 1e8).toString(), // 1 btc = 100000000 satoshis
  });

  // 1 BTC == 4500000 ONE
  const oneToken = bitcoin * 4500000;

  // create harmony order using the same hash from the bitcoin invoice
  const hash = "0x" + invoice.id;
  const { transactionHash } = await harmony.create(hash, toAddress, oneToken);

  // user verifies transaction, then pays invoice
  res.send({
    transaction: transactionHash,
    invoice: invoice.request,
  });

  // refund if order ln isn't paid
  setTimeout(async () => {
    const { transactionHash } = harmony.refund(hash);
    console.log("Refund: " + transactionHash);
  }, 1000 * 60 * 60 * 20);
});

lnService.subscribeToInvoices({ lnd }).on("invoice_updated", async (invoice) => {
  if (invoice.is_confirmed) {
    // doing client a favor and unlocking contract
    const { secret } = invoice;
    const { transactionHash } = await harmony.withdraw("0x" + secret);
    console.log("Withdraw: " + transactionHash);
  }
});

app.listen(80, () => console.log("listening on port 80"));