import * as fs from "fs";
import { createWorker } from "tesseract.js";
import * as XLSX from "xlsx";
import sharp from "sharp";
import { parse, isValid, max, format, min } from "date-fns";
import { table } from "console";
import { type } from "os";

type Person = {
  name: string;
  hn?: string;
  gender?: string;
  birthDate?: string;
  film?: string;
};

type RawData = {
  name: string;
  raw?: string;
};

function createPerson(path: string) {
  const splited = path.split(" ");
  const firstName = splited[0];
  const lastName = splited[1];
  const birthDate = splited[2];

  const person: Person = {
    name: `${firstName} ${lastName}`,
    birthDate: format(parse(birthDate, "MM-yyyy", new Date()), "MM/yyyy"),
  };
  return person;
}

(async () => {
  console.log("start async function");
  const worker = await createWorker({});
  await worker.loadLanguage("eng");
  await worker.initialize("eng");

  const norm = await genNorm(worker);
  console.table(getIncompleteData(norm));
  // getExcel("norm", norm);

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

async function genNorm(worker: Tesseract.Worker) {
  let persons: Person[] = [];
  const rawList: RawData[] = [];
  const rootDir = "./norm";
  let files = getFileWithoutDS(rootDir);
  // files = files.slice(0, 5);

  for (const folder of files) {
    const person = createPerson(folder);
    console.log("person", person.name);
    const rawData: RawData = { name: person.name };
    // await fillPersonData(worker, rootDir, folder, person);
    const inner = getFileWithoutDS(`${rootDir}/${folder}`);
    const filename =
      inner.find((f) => !f.includes("processed") && f.includes("Cep")) ??
      inner[0];
    const processedImgPath = await preprocessImg(
      `${rootDir}/${folder}`,
      filename
    );

    const {
      data: { text },
    } = await worker.recognize(processedImgPath);

    rawData.raw = text;
    rawList.push(rawData);
    // persons.push({ ...person });
  }
  console.table(rawList);
  const data = JSON.stringify(rawList);

  // write JSON string to a file
  fs.writeFile("raw_user.json", data, (err) => {
    if (err) {
      throw err;
    }
    console.log("JSON data is saved.");
  });
  // console.table(persons);
  return persons;
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

function getDates(texts: string[]) {
  texts = texts.map((t) => t.substring(0, 10));
  const dates = texts.map((t) => parse(t, "yyyy-MM-dd", new Date()));
  const validDate = dates.filter((d) => isValid(d));

  return validDate;
}

function getFilmDate(texts: string[]) {
  const dates = getDates(texts);
  if (dates.length === 0) return;
  const date = max(dates);
  return format(date, "MM-yyyy");
}

function getBirthDate(texts: string[]) {
  const dates = getDates(texts);
  if (dates.length === 0) return;
  const date = min(dates);
  return format(date, "MM-yyyy");
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

async function getStringFromImg(
  worker: Tesseract.Worker,
  path: string,
  file: string
) {
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

function getIncompleteData(persons: Person[]) {
  return persons.filter((p) => isIncomplete(p));
}

async function fillPersonData(
  worker: Tesseract.Worker,
  rootDir: string,
  folder: string,
  person: Person
) {
  const inner = getFileWithoutDS(`${rootDir}/${folder}`);
  const filename =
    inner.find((f) => !f.includes("processed") && f.includes("Cep")) ??
    inner[0];
  const texts = await getStringFromImg(
    worker,
    `${rootDir}/${folder}`,
    filename
  );

  person.hn = getHN(texts);
  person.gender = getGender(texts);
  person.birthDate = getBirthDate(texts) || person.birthDate;
  person.film = getFilmDate(texts);
  if (isIncomplete(person)) {
    console.log("isIncomplete", texts);
  }
}

function getExcel(prefix: string, data: object[]) {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "sheet1");

  const date = new Date().toISOString();
  XLSX.writeFile(workbook, `${date}-${prefix}.xlsx`);
}

function isIncomplete(person: Person) {
  const values = Object.values(person);
  const isIncomplete = values.some((v) => v === undefined || v === "");
  return isIncomplete;
}
