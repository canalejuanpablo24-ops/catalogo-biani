const fs = require('fs');
const https = require('https');
const path = require('path');

// Read environment variables
const token = process.env.AIRTABLE_TOKEN;
const baseId = process.env.AIRTABLE_BASE_ID;
const tableName = process.env.AIRTABLE_TABLE_NAME || "Productos BIANI";

if (!token || !baseId) {
  console.error("Error: AIRTABLE_TOKEN and AIRTABLE_BASE_ID must be set in environment variables.");
  process.exit(1);
}

// Asegurar que la carpeta de imágenes exista
const imgDir = path.join(__dirname, 'imagenes_productos');
if (!fs.existsSync(imgDir)){
    fs.mkdirSync(imgDir, { recursive: true });
}

// Función auxiliar para descargar imágenes de forma segura
function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download image: HTTP ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
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
    await new Promise(r => setTimeout(r, 220));
  }

  console.log(`Fetched ${allRecords.length} records.`);
  return allRecords;
}

// Category array matching index.html
const CA = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "R", "S", "T", "V", "Y", "Z"];

async function mapRecordsToProducts(records) {
  const mapped = [];
  
  for (const r of records) {
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

    // Lógica nueva: Descargar imagen localmente si existe
    let final_img_path = "";
    if (f["Imagen"] && f["Imagen"].length > 0) {
      const airtable_img_url = f["Imagen"][0].url || "";
      if (airtable_img_url && code) {
        // Limpiamos el código para usarlo de nombre de archivo seguro
        const safeCode = String(code).replace(/[^a-zA-Z0-9]/g, "_");
        const fileName = `prod_${safeCode}.jpg`;
        const destPath = path.join(imgDir, fileName);
        
        try {
          console.log(`Downloading image for product: ${name || code}`);
          await downloadImage(airtable_img_url, destPath);
          // Esta ruta relativa es la que va a leer tu index.html
          final_img_path = `imagenes_productos/${fileName}`;
        } catch (imgErr) {
          console.error(`Could not download image for ${code}:`, imgErr.message);
          final_img_path = ""; // Si falla, queda vacío pero no rompe el proceso
        }
      }
    }

    mapped.push({
      c: code,
      n: name,
      p: price_cents,
      img: final_img_path,
      cat: cat_idx,
      st: 0
    });
  }
  
  return mapped;
}

async function run() {
  try {
    const records = await getAllProducts();
    // Agregamos el await porque ahora la descarga lleva tiempo
    const products = await mapRecordsToProducts(records);

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
    console.log("index.html updated successfully with local image paths!");
  } catch (err) {
    console.error("Build failed:", err);
    process.exit(1);
  }
}

run();
