function validateAndNormalizeRut(rawValue) {
  const raw = rawValue === null || rawValue === undefined ? "" : String(rawValue).trim().toUpperCase();
  if (!raw) {
    return buildRutResult_(raw, "", false, "VACIO", "");
  }

  const compact = raw.replace(/[^0-9K]/g, "").toUpperCase();
  if (compact.length < 2) {
    return buildRutResult_(raw, "", false, "FORMATO_INVALIDO", "");
  }

  const body = compact.slice(0, -1);
  const providedDv = compact.slice(-1);

  if (!/^\d+$/.test(body)) {
    return buildRutResult_(raw, "", false, "FORMATO_INVALIDO", "");
  }

  const normalizedBody = removeLeadingZeros_(body);
  if (!normalizedBody || normalizedBody === "0") {
    return buildRutResult_(raw, "", false, "FORMATO_INVALIDO", "");
  }

  if (normalizedBody.length > 8) {
    return buildRutResult_(raw, "", false, "FORMATO_INVALIDO", "");
  }

  const expectedDv = computeRutDv_(normalizedBody);
  const normalized = normalizedBody + "-" + providedDv;

  if (expectedDv !== providedDv) {
    return buildRutResult_(raw, normalized, false, "DV_INVALIDO", expectedDv);
  }

  return buildRutResult_(raw, normalizedBody + "-" + expectedDv, true, "", expectedDv);
}

function computeRutDv_(bodyDigits) {
  let sum = 0;
  let multiplier = 2;

  for (let index = bodyDigits.length - 1; index >= 0; index -= 1) {
    sum += Number(bodyDigits.charAt(index)) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = 11 - (sum % 11);
  if (remainder === 11) {
    return "0";
  }
  if (remainder === 10) {
    return "K";
  }
  return String(remainder);
}

function removeLeadingZeros_(digits) {
  const withoutLeadingZeros = String(digits).replace(/^0+/, "");
  return withoutLeadingZeros || "0";
}

function buildRutResult_(input, normalized, isValid, reason, expectedDv) {
  return {
    input,
    normalized,
    isValid,
    reason,
    expectedDv,
  };
}

function runRutEngineSelfTest() {
  const testCases = [
    // --- Casos validos basicos ---
    {
      input: "12.345.678-5",
      expectedValid: true,
      expectedNormalized: "12345678-5",
      desc: "formato con puntos y guion",
    },
    {
      input: "76086428-5",
      expectedValid: true,
      expectedNormalized: "76086428-5",
      desc: "formato sin puntos",
    },
    {
      input: "7.617.343-5",
      expectedValid: true,
      expectedNormalized: "7617343-5",
      desc: "7 digitos con puntos",
    },
    // --- K como digito verificador ---
    {
      input: "1.000.411-K",
      expectedValid: true,
      expectedNormalized: "1000411-K",
      desc: "DV K mayuscula",
    },
    {
      input: "1.000.411-k",
      expectedValid: true,
      expectedNormalized: "1000411-K",
      desc: "DV k minuscula",
    },
    {
      input: "1000411k",
      expectedValid: true,
      expectedNormalized: "1000411-K",
      desc: "DV k minuscula sin separadores",
    },
    // --- DV 0 ---
    {
      input: "11.111.111-1",
      expectedValid: true,
      expectedNormalized: "11111111-1",
      desc: "RUT con DV 1",
    },
    // --- Formatos alternativos que deben parsearse ---
    {
      input: "12 345 678 5",
      expectedValid: true,
      expectedNormalized: "12345678-5",
      desc: "separado por espacios",
    },
    {
      input: "12345678-5",
      expectedValid: true,
      expectedNormalized: "12345678-5",
      desc: "formato compacto con guion",
    },
    {
      input: "123456785",
      expectedValid: true,
      expectedNormalized: "12345678-5",
      desc: "todo junto sin separador",
    },
    // --- Ceros iniciales ---
    {
      input: "00012345-6",
      expectedValid: false,
      expectedReason: "DV_INVALIDO",
      desc: "ceros iniciales con DV incorrecto",
    },
    {
      input: "007617343-5",
      expectedValid: true,
      expectedNormalized: "7617343-5",
      desc: "ceros iniciales con DV correcto, se normalizan",
    },
    // --- DV invalido ---
    {
      input: "12345678-9",
      expectedValid: false,
      expectedReason: "DV_INVALIDO",
      desc: "DV incorrecto",
    },
    {
      input: "12.345.678-0",
      expectedValid: false,
      expectedReason: "DV_INVALIDO",
      desc: "DV incorrecto con puntos",
    },
    {
      input: "76086428-3",
      expectedValid: false,
      expectedReason: "DV_INVALIDO",
      desc: "DV incorrecto sin puntos",
    },
    // --- Vacios y nulos ---
    {
      input: "",
      expectedValid: false,
      expectedReason: "VACIO",
      desc: "string vacio",
    },
    {
      input: null,
      expectedValid: false,
      expectedReason: "VACIO",
      desc: "null",
    },
    {
      input: undefined,
      expectedValid: false,
      expectedReason: "VACIO",
      desc: "undefined",
    },
    {
      input: "   ",
      expectedValid: false,
      expectedReason: "VACIO",
      desc: "solo espacios",
    },
    // --- Formato invalido ---
    {
      input: "ABC",
      expectedValid: false,
      expectedReason: "FORMATO_INVALIDO",
      desc: "letras sin numeros",
    },
    {
      input: "A",
      expectedValid: false,
      expectedReason: "FORMATO_INVALIDO",
      desc: "un solo caracter letra",
    },
    {
      input: "1",
      expectedValid: false,
      expectedReason: "FORMATO_INVALIDO",
      desc: "un solo digito",
    },
    {
      input: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      expectedValid: false,
      expectedReason: "FORMATO_INVALIDO",
      desc: "texto largo corrupto puro letras",
    },
    {
      input: "esto no es un rut valido en absoluto",
      expectedValid: false,
      expectedReason: "FORMATO_INVALIDO",
      desc: "texto narrativo corrupto",
    },
    {
      input: "123456789-0",
      expectedValid: false,
      expectedReason: "FORMATO_INVALIDO",
      desc: "body de 9 digitos (maximo es 8)",
    },
    {
      input: "0",
      expectedValid: false,
      expectedReason: "FORMATO_INVALIDO",
      desc: "solo cero",
    },
    {
      input: "00",
      expectedValid: false,
      expectedReason: "FORMATO_INVALIDO",
      desc: "doble cero",
    },
    {
      input: "---",
      expectedValid: false,
      expectedReason: "FORMATO_INVALIDO",
      desc: "solo guiones",
    },
    {
      input: "...",
      expectedValid: false,
      expectedReason: "FORMATO_INVALIDO",
      desc: "solo puntos",
    },
  ];

  const failures = [];

  testCases.forEach((testCase, index) => {
    const label = "Caso #" + (index + 1) + " (" + (testCase.desc || testCase.input) + ")";
    const result = validateAndNormalizeRut(testCase.input);

    if (result.isValid !== testCase.expectedValid) {
      failures.push(
        label + ": expectedValid=" + testCase.expectedValid + ", got=" + result.isValid
      );
      return;
    }

    if (testCase.expectedNormalized && result.normalized !== testCase.expectedNormalized) {
      failures.push(
        label + ": expectedNormalized=" + testCase.expectedNormalized + ", got=" + result.normalized
      );
      return;
    }

    if (testCase.expectedReason && result.reason !== testCase.expectedReason) {
      failures.push(
        label + ": expectedReason=" + testCase.expectedReason + ", got=" + result.reason
      );
    }
  });

  if (failures.length > 0) {
    throw new Error("runRutEngineSelfTest fallo (" + failures.length + "/" + testCases.length + "):\n" + failures.join("\n"));
  }

  return "runRutEngineSelfTest OK (" + testCases.length + " casos)";
}
