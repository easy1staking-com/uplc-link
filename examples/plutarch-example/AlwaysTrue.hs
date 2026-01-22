{-# LANGUAGE DataKinds #-}
{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE TypeApplications #-}
{-# LANGUAGE TypeFamilies #-}

module AlwaysTrue where

import Plutarch
import Plutarch.Api.V2 (PScriptContext, PValidator)
import Plutarch.Prelude
import qualified Plutus.V2.Ledger.Api as PlutusV2
import Cardano.Api.Shelley (PlutusScript (..), PlutusScriptV2, writeFileTextEnvelope)
import Cardano.Api (Error(displayError))
import qualified Data.ByteString.Short as SBS
import qualified Data.ByteString.Lazy as LBS
import Codec.Serialise (serialise)

-- | A simple parameterized always-true validator in Plutarch
-- This validator accepts any transaction (always returns True)
--
-- Parameters:
--   - beneficiary: A ByteString representing the beneficiary's public key hash
--   - deadline: An Integer representing the deadline (POSIXTime)
--
-- The parameters are included in the validator but not actually checked,
-- making this an "always true" validator for testing purposes.
alwaysTrueValidator :: Term s (PByteString :--> PInteger :--> PValidator)
alwaysTrueValidator = plam $ \beneficiary deadline datum redeemer ctx ->
  popaque $ pconstant ()

-- | Compile the validator to a Plutus script
-- This creates an unparameterized version (requires parameters to be applied later)
compileValidator :: PlutusV2.Script
compileValidator = PlutusV2.Script $ fromCompiledCode (compile alwaysTrueValidator)

-- | Helper to extract compiled code from Plutarch's compile result
fromCompiledCode :: ClosedTerm a -> SBS.ShortByteString
fromCompiledCode term =
  let script = either (error . show) id $ compile (Config NoTracing) term
  in SBS.toShort $ LBS.toStrict $ serialise script

-- | Write the unparameterized validator to a .plutus file
writeValidatorToFile :: IO ()
writeValidatorToFile = do
    let scriptShortBs = case compileValidator of
            PlutusV2.Script s -> s
        scriptSerial = PlutusScriptSerialised scriptShortBs
    result <- writeFileTextEnvelope "plutarch-always-true.plutus" Nothing (PlutusScript PlutusScriptV2 scriptSerial)
    case result of
        Left err -> print $ displayError err
        Right () -> putStrLn "Successfully wrote plutarch-always-true.plutus"

-- | Apply parameters to the validator
-- In Plutarch, you need to apply parameters at the Plutus level using applyArguments
-- or compile a specialized version with the parameters baked in
applyParameters :: PlutusV2.Script -> [PlutusV2.Data] -> PlutusV2.Script
applyParameters script params =
    -- This would use Cardano.Api's applyArguments or similar
    -- For now, this is a placeholder
    error "Parameter application needs to be implemented using Cardano.Api.applyArguments"

main :: IO ()
main = do
    putStrLn "Compiling Plutarch always-true validator..."
    writeValidatorToFile
    putStrLn "Done!"
    putStrLn "\nNote: To apply parameters, use cardano-cli or Cardano.Api.applyArguments"
    putStrLn "Example parameters:"
    putStrLn "  - beneficiary: a 28-byte public key hash (hex)"
    putStrLn "  - deadline: a POSIXTime integer (e.g., 1234567890)"
