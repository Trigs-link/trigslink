async function main() {
    const [signer] = await ethers.getSigners();
    console.log("---------------------------------------");
    console.log("Deploying from:", signer.address);
    const balance = await ethers.provider.getBalance(signer.address);
    console.log("Balance:", ethers.formatEther(balance), "ETH");
    console.log("---------------------------------------");
  }
  
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });