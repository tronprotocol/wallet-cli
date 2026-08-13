# Network commands

Switch between and inspect the configured TRON networks. The three built-in networks are `MAIN`, `NILE`, and `SHASTA`; you can also point at a custom endpoint. See the [configuration reference](../reference/config.md) for how networks are configured locally.

## SwitchNetwork

Switch networks at any time. `switchnetwork local` switches to the network configured in your local `config.conf`.

Interactive selection:

```console
wallet> switchnetwork
Please select network：
1. MAIN
2. NILE
3. SHASTA
Enter numbers to select a network (1-3):1
Now, current network is : MAIN
SwitchNetwork  successful !!!
```

Direct selection by name:

```console
wallet> switchnetwork main
Now, current network is : MAIN
SwitchNetwork  successful !!!
```

Custom endpoint (`switchnetwork <fullnode> <soliditynode>`, `empty` to omit one):

```console
wallet> switchnetwork empty localhost:50052
Now, current network is : CUSTOM
SwitchNetwork  successful !!!
```

## CurrentNetwork

View the current network.

```console
wallet> currentnetwork
currentNetwork: NILE
```

For a custom network, the node endpoints are shown:

```console
wallet> currentnetwork
current network: CUSTOM
fullNode: EMPTY, solidityNode: localhost:50052
```

## See also

- [reference/config](../reference/config.md) — node endpoint configuration
