use aiken/collection/list
use cardano/address.{Address}
use cardano/transaction.{OutputReference, Transaction}
use cardano/value
use env

validator vault(
  owner: ByteArray,
  threshold: Int,
  pair: Pair<Int, ByteArray>,
  tuple: (ByteArray, Int),
  nested: Option<Option<Int>>,
  seed: OutputReference,
  payee: Address,
  minimum: Value,
) {
  spend(_d: Option<Data>, _r: Data, o: OutputReference, self: Transaction) {
    let Pair(k, b) = pair
    let (tb, ti) = tuple
    let n = when nested is {
      Some(Some(x)) -> x
      Some(None) -> 1
      None -> 0
    }
    and {
      list.has(self.extra_signatories, owner),
      o != seed,
      k + ti + n < threshold,
      b != tb,
      env.tag != owner,
      list.any(
        self.outputs,
        fn(out) {
          out.address == payee && value.contains(
            value.from_assets(out.value),
            minimum,
          )
        },
      ),
    }
  }

  else(_) {
    fail
  }
}
