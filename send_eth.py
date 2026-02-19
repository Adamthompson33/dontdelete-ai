from web3 import Web3

# Connect to Ethereum mainnet
w3 = Web3(Web3.HTTPProvider('https://eth.llamarpc.com'))

# Wallet details
private_key = '0xe604c1af97525307bd682fec11b2182e0818b11434ae90c7c66e1328fff3ef57'
from_addr = Web3.to_checksum_address('0x551C4bDd737A0CE89234948C789B1DA4ae647B31')
to_addr = Web3.to_checksum_address('0xc035967c19f5c984517ee136110a64635d0f04ce')

# Get balance
balance = w3.eth.get_balance(from_addr)
print(f"Balance: {w3.from_wei(balance, 'ether')} ETH")

# Get gas price
gas_price = w3.eth.gas_price
print(f"Gas price: {w3.from_wei(gas_price, 'gwei')} Gwei")

# Calculate amount to send (balance - gas cost)
gas_limit = 21000
gas_cost = gas_limit * gas_price
send_amount = balance - gas_cost

print(f"Gas cost: {w3.from_wei(gas_cost, 'ether')} ETH")
print(f"Sending: {w3.from_wei(send_amount, 'ether')} ETH")

if send_amount > 0:
    # Build transaction
    nonce = w3.eth.get_transaction_count(from_addr)
    tx = {
        'nonce': nonce,
        'to': to_addr,
        'value': send_amount,
        'gas': gas_limit,
        'gasPrice': gas_price,
        'chainId': 1
    }
    
    # Sign and send
    signed = w3.eth.account.sign_transaction(tx, private_key)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    print(f"TX Hash: {tx_hash.hex()}")
else:
    print("Not enough balance")
