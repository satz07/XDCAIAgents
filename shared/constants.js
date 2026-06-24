export const XDC_MAINNET = {
  chainId: 50,
  caip2: "eip155:50",
  rpcUrl: "https://erpc.xdcrpc.com",
  usdcAddress: "0xfA2958CB79b0491CC627c1557F441eF849Ca8eb1",
  usdcDecimals: 6,
  minGasPriceGwei: "12.5",
  gasLimit: 100_000n,
  explorerUrl: "https://xdcscan.com",
};

export const XDC_APOTHEM = {
  chainId: 51,
  caip2: "eip155:51",
  rpcUrl: "https://erpc.apothem.network",
  usdcAddress: "0xb5AB69F7bBada22B28e79C8FFAECe55eF1c771D4",
  usdcDecimals: 6,
  minGasPriceGwei: "12.5",
  gasLimit: 100_000n,
  explorerUrl: "https://testnet.xdcscan.com",
};

export function getNetworkConfig(chainId = Number(process.env.CHAIN_ID || XDC_MAINNET.chainId)) {
  return chainId === XDC_APOTHEM.chainId ? XDC_APOTHEM : XDC_MAINNET;
}

export function getExplorerTxUrl(txHash, chainId = Number(process.env.CHAIN_ID || XDC_MAINNET.chainId)) {
  const base = getNetworkConfig(chainId).explorerUrl;
  return `${base}/tx/${txHash}`;
}

export function getExplorerAddressUrl(address, chainId = Number(process.env.CHAIN_ID || XDC_MAINNET.chainId)) {
  const base = getNetworkConfig(chainId).explorerUrl;
  return `${base}/address/${address}`;
}

export const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

export const X_PAYMENT_HEADER = "x-payment";
export const X_PAYMENT_RESPONSE_HEADER = "x-payment-response";
