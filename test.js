const Web3 = require("web3");
const ethNetwork = 'https://rinkeby.infura.io/v3/cdde516ec62c4706ba81e3ef8f265879';
const web3 = new Web3(new Web3.providers.HttpProvider(ethNetwork));

// let's fetch a balance

web3.eth.getBalance('0x3bd2e500c697398e821650a561f103fbf2a4a55b', async (err, result) => {
    if (err) {
	console.log(err);
        return;
    }
    let balance = web3.utils.fromWei(result, "ether");
    console.log(balance + " ETH");
});
