const fs = require('fs');
const https = require('https');

// Read environment variables
const token = process.env.AIRTABLE_TOKEN;
const baseId = process.env.AIRTABLE_BASE_ID;
const tableName = process.env.AIRTABLE_TABLE_NAME || "Productos BIANI";

if (!token || !baseId) {
  console.error("Error: AIRTABLE_TOKEN and AIRTABLE_BASE_ID must be set in environment variables.");
  process.exit(1);
}

// Fetch records from Airtable
function fetchAirtableRecords(offset = '') {
  return new Promise((resolve, reject) => {
    const encodedTable = encodeURIComponent(tableName);
    let url = `https://api.airtable.com/v0/${baseId}/${encodedTable}`;
    if (offset) {
      url += `?offset=${offset}`;
    }

    const options = {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    };

    https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function getAllProducts() {
  let allRecords = [];
  let offset = '';
  console.log("Fetching products from Airtable...");
  
  while (true) {
    const res = await fetchAirtableRecords(offset);
    allRecords = allRecords.concat(res.records);
    offset = res.offset;
    if (!offset) {
      break;
    }
    // Rate limit sleep (Airtable allows 5 requests/sec, 200ms sleep is safe)
    await new Promise(r => setTimeout(r, 220));
  }
  
  console.log(`Fetched ${allRecords.length} records.`);
  return allRecords;
}

// Category array matching index.html
const CA = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "R", "S", "T", "V", "Y", "Z"];

function mapRecordsToProducts(records) {
  return records.map(r => {
    const f = r.fields;
    const code = f["Codigo"] || "";
    const name = f["Name"] || "";
    const price_dec = f["Precio"] || 0;
    const price_cents = Math.round(price_dec * 100);
    
    // Map category
    let cat_letter = f["Categoria"] || "";
    if (!cat_letter && name) {
      cat_letter = name[0].toUpperCase();
    }
    let cat_idx = CA.indexOf(cat_letter);
    if (cat_idx < 0) {
      cat_idx = 0;
    }
    
    // Image attachment
    let img_url = "";
    if (f["Imagen"] && f["Imagen"].length > 0) {
      img_url = f["Imagen"][0].url || "";
    }
    
    return {
      c: code,
      n: name,
      p: price_cents,
      img: img_url,
      cat: cat_idx,
      st: 0
    };
  });
}

async function run() {
  try {
    const records = await getAllProducts();
    const products = mapRecordsToProducts(records);
    
    // Read index.html
    console.log("Reading index.html...");
    let html = fs.readFileSync('index.html', 'utf8');
    
    // Replace the var P declaration
    const productsJson = JSON.stringify(products);
    const pRegex = /^var P\s*=\s*\[[\s\S]*?\];/m;
    
    if (!pRegex.test(html)) {
      throw new Error("Could not find 'var P=[...];' declaration in index.html");
    }
    
    html = html.replace(pRegex, `var P = ${productsJson};`);
    
    // Write back index.html
    fs.writeFileSync('index.html', html, 'utf8');
    console.log("index.html updated successfully with new Airtable data!");
  } catch (err) {
    console.error("Build failed:", err);
    process.exit(1);
  }
}

run();
