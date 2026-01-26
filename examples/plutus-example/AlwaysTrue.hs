{-# LANGUAGE DataKinds #-}
{-# LANGUAGE TemplateHaskell #-}
{-# LANGUAGE NoImplicitPrelude #-}
{-# LANGUAGE ScopedTypeVariables #-}
{-# LANGUAGE OverloadedStrings #-}

module AlwaysTrue where

import PlutusTx
import PlutusTx.Prelude
import qualified Plutus.V2.Ledger.Api as PlutusV2
import qualified Plutus.V2.Ledger.Contexts as Contexts
import Cardano.Api.Shelley (PlutusScript (..), PlutusScriptV2, writeFileTextEnvelope)
import Cardano.Api (Error(displayError))
import qualified Data.ByteString.Short as SBS
import qualified Data.ByteString.Lazy as LBS
import Codec.Serialise (serialise)
import qualified Plutus.V1.Ledger.Scripts as Scripts

-- | A simple parameterized validator that always returns True
-- Parameters:
--   - beneficiary: PubKeyHash of the intended beneficiary
--   - deadline: POSIXTime deadline for the transaction
{-# INLINABLE mkValidator #-}
mkValidator :: BuiltinByteString -> Integer -> BuiltinData -> BuiltinData -> BuiltinData -> ()
mkValidator beneficiary deadline _datum _redeemer _ctx = ()

-- Compile the validator with parameters applied
validator :: PlutusV2.Validator
validator = PlutusV2.mkValidatorScript $$(compile [|| mkValidator ||])

-- | Parameterized version - apply beneficiary and deadline
mkParameterizedValidator :: BuiltinByteString -> Integer -> PlutusV2.Validator
mkParameterizedValidator pkh deadline =
    PlutusV2.mkValidatorScript $
        $$(compile [|| mkValidator ||])
        `applyCode` liftCode pkh
        `applyCode` liftCode deadline

-- | Serialize and write unparameterized validator to file
writeValidatorToFile :: IO ()
writeValidatorToFile = do
    let scriptShortBs = SBS.toShort . LBS.toStrict $ serialise $ PlutusV2.unValidatorScript validator
        scriptSerial = PlutusScriptSerialised scriptShortBs
    result <- writeFileTextEnvelope "always-true-unparameterized.plutus" Nothing (PlutusScript PlutusScriptV2 scriptSerial)
    case result of
        Left err -> print $ displayError err
        Right () -> putStrLn "Successfully wrote always-true-unparameterized.plutus"

-- | Serialize and write parameterized validator to file
-- Example: beneficiary = "abcd1234..." (28 bytes hex as ByteString)
--          deadline = 1234567890 (POSIXTime)
writeParameterizedValidatorToFile :: BuiltinByteString -> Integer -> IO ()
writeParameterizedValidatorToFile pkh deadline = do
    let validator' = mkParameterizedValidator pkh deadline
        scriptShortBs = SBS.toShort . LBS.toStrict $ serialise $ PlutusV2.unValidatorScript validator'
        scriptSerial = PlutusScriptSerialised scriptShortBs
    result <- writeFileTextEnvelope "always-true-parameterized.plutus" Nothing (PlutusScript PlutusScriptV2 scriptSerial)
    case result of
        Left err -> print $ displayError err
        Right () -> putStrLn "Successfully wrote always-true-parameterized.plutus"

-- | Example main function
main :: IO ()
main = do
    putStrLn "Writing unparameterized validator..."
    writeValidatorToFile

    putStrLn "\nWriting parameterized validator..."
    -- Example parameters (you'll need to provide actual values)
    let examplePkh = "abcd1234567890abcd1234567890abcd1234567890abcd1234567890"
        exampleDeadline = 1234567890
    writeParameterizedValidatorToFile examplePkh exampleDeadline

    putStrLn "\nDone!"
