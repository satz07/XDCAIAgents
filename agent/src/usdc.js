import { ethers } from "ethers";
import { ERC20_ABI, XDC_MAINNET, getNetworkConfig } from "@xdc-x402/shared";
import { normalizeAddress } from "@xdc-x402/shared";
import { getUsdcBalance } from "./wallet.js";

export async function transferUsdc(wallet, to, amountUsdc) {
  const chainId = Number(process.env.CHAIN_ID || XDC_MAINNET.chainId);
  const network = getNetworkConfig(chainId);
  const usdcAddr = process.env.USDC_ADDRESS || network.usdcAddress;
  const decimals = Number(process.env.USDC_DECIMALS || network.usdcDecimals);
  const usdc = new ethers.Contract(usdcAddr, ERC20_ABI, wallet);
  const amountWei = ethers.parseUnits(String(amountUsdc), decimals);
  const recipient = normalizeAddress(to);
  const checksummed = ethers.getAddress(recipient);

  const { formatted } = await getUsdcBalance(wallet);
  if (Number(formatted) < Number(amountUsdc)) {
    throw new Error(
      `Insufficient USDC: ${formatted} available, ${amountUsdc} required`
    );
  }

  const tx = await usdc.transfer(checksummed, amountWei, {
    type: 0,
    gasPrice: ethers.parseUnits(network.minGasPriceGwei, "gwei"),
    gasLimit: network.gasLimit,
  });

  const receipt = await tx.wait();
  return {
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    to: checksummed,
    amount: amountUsdc,
  };
}
