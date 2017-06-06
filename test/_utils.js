
export function applyJSONEqual(t, szActualJSON, expected) ::
  const actual = JSON.parse(szActualJSON)

  if t.debug ::
    console.dir @ {actual}, {colors: true, depth: null}
    console.dir @ {expected}, {colors: true, depth: null}

  try ::
    return t.deepEqual @ actual, expected
  catch err ::
    console.dir @ {actual}, {colors: true, depth: null}
    console.dir @ {expected}, {colors: true, depth: null}
    //throw err
