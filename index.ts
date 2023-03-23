import * as fs from "fs";
import { createWorker } from "tesseract.js";
import * as XLSX from "xlsx";
import sharp from "sharp";

type Person = {
  name: string;
  hn?: string;
  gender?: string;
  birthDate?: string;
  film?: string;
};

function createPerson(path: string){
  const splited = path.split(" ");
  const firstName = splited[0];
  const lastName = splited[1];
  const birthDate = splited[2];

  const person: Person = {
    name: `${firstName} ${lastName}`,
    birthDate,
  };
  return person;
}

(async () => {
  console.log("start async function");
  const worker = await createWorker({});
  await worker.loadLanguage("eng");
  await worker.initialize("eng");

  const norm = await genNorm( worker);
  // getExcel("CLCP", clcp);

  await worker.terminate();
  console.log("end async function");
})();



async function genCLCP(worker: Tesseract.Worker) {
  let persons: Person[] = [];
  let files = getFileWithoutDS("./CLCP");

  // files = files.slice(0, 3);
  for (const file of files) {
    // name: "กมลภพ เทพขวัญ"
    const person = createPerson(file);
    console.log("person", person.name);
    
    const inner = getFileWithoutDS(`./CLCP/${file}`);
    // console.log("inner", inner);
    for (const innerFile of inner) {
      person.film = innerFile.substring(3);
      const imgFile = getFileWithoutDS(`./CLCP/${file}/${innerFile}`);

      const imgPath = `./CLCP/${file}/${innerFile}`;
      // Preprocess the image
      const processedImgPath = await preprocessImg(imgPath, imgFile[0]);

      const {
        data: { text },
      } = await worker.recognize(processedImgPath);
      let textSplit = text.split(/\r?\n/);
      textSplit = textSplit.map((t) => {
        let s = t.split(":");
        if (s.length > 1) {
          return s[1].trim();
        }
        return s[0];
      });

      person.hn = getHN(textSplit);
      person.gender = getGender(textSplit);
      persons.push({ ...person });
    }
  }
  persons = persons.map((p) => {
    p.birthDate = p.birthDate!.replace("-", "/");
    p.film = p.film!.replace("-", "/");
    return p;
  });
  console.table(persons);

  return persons;
}

async function genNorm(worker: Tesseract.Worker){
  let persons: Person[] = [];
  let files = getFileWithoutDS("./norm");
  files = files.slice(0, 2);

  for (const folder of files) {
    const person = createPerson(folder);
    console.log("person", person.name);
    
    const inner = getFileWithoutDS(`./norm/${folder}`);
    const texts = await getStringFromImg(worker, `./norm/${folder}`, inner[0])
    
    console.log("🚀 ~ file: index.ts:101 ~ genNorm ~ texts:", texts)
    person.hn = getHN(texts);
    person.gender = getGender(texts);
    persons.push({ ...person });
  }
  console.table(persons);
  return persons
}

function getFileWithoutDS(path: string) {
  const list = fs.readdirSync(path);
  return list.filter((file) => file !== ".DS_Store");
}

function getHN(texts: string[]) {
  let textSplit = texts.filter((t) => t.length > 5);
  textSplit = textSplit.filter((t) => isNaN(+t) === false);
  if (textSplit.length > 0) {
    return textSplit[0];
  }
  return "";
}

function getGender(texts: string[]) {
  let textSplit = texts.filter(
    (t) => t.includes("Male") || t.includes("Female")
  );
  if (textSplit.length > 0) {
    const gender = textSplit[0] === "Male" ? "ชาย" : "หญิง";
    return gender;
  }
  return "";
}

async function preprocessImg(path: string, filename: string) {
  // const path = `./CLCP/${file}/${innerFile}`;
  const imgPath = `${path}/${filename}`;

  // Preprocess the image
  const processedImgPath = `${path}/processed_${filename}`;
  // Use sharp to preprocess the image and enhance contrast
  const image = sharp(imgPath)
    .extract({ left: 0, top: 0, width: 300, height: 200 })
    .grayscale()
    .sharpen();

  // Apply a yellow color filter and detect black borders
  await image
    .toColorspace("b-w")
    .threshold(170)
    .flatten({ background: "yellow" })
    .trim("black")
    .toFile(processedImgPath);
  // .toBuffer({ resolveWithObject: true });
  return processedImgPath;
}

async function getStringFromImg(worker: Tesseract.Worker , path: string, file: string) {
  const processedImgPath = await preprocessImg(path, file);
  
  const {
    data: { text },
  } = await worker.recognize(processedImgPath);
  let textSplit = text.split(/\r?\n/);
  textSplit = textSplit.map((t) => {
    let s = t.split(":");
    if (s.length > 1) {
      return s[1].trim();
    }
    return s[0];
  });

  return textSplit;
}

function getExcel(prefix: string, data: object[]) {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "sheet1");

  const date = new Date().toISOString();
  XLSX.writeFile(workbook, `${date}-${prefix}.xlsx`);
}
