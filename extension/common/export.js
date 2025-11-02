import { createZip } from "./zip.js";
import {
  dataUrlToUint8,
  escapeXml,
  inferImageExtension,
  sanitizeFileName,
  stringToUint8,
  toUint8Array
} from "./utils.js";

export function buildMarkdownExport(notes) {
  const parts = (notes ?? []).map((note) => toMarkdown(note));
  return parts.join("\n\n---\n\n");
}

export function buildMarkdownArchive(notes = [], extraFiles = []) {
  const files = [];
  for (const note of notes) {
    const content = toMarkdown(note);
    const filename = sanitizeFileName(`${note.title || "note"}-${note.id}.md`);
    files.push({
      name: filename,
      data: stringToUint8(content),
      date: new Date(note.updatedAt || Date.now())
    });
  }
  for (const file of extraFiles) {
    files.push({
      name: file.name,
      data: toUint8Array(file.data),
      date: file.date ? new Date(file.date) : new Date()
    });
  }
  return createZip(files);
}

export async function buildDocxExport(note) {
  const imageEntries = prepareImageEntries(note.attachments?.images ?? []);
  const files = [
    {
      name: "[Content_Types].xml",
      data: stringToUint8(contentTypesXml(imageEntries))
    },
    {
      name: "_rels/.rels",
      data: stringToUint8(rootRelsXml())
    },
    {
      name: "word/document.xml",
      data: stringToUint8(documentXml(note, imageEntries))
    },
    {
      name: "word/_rels/document.xml.rels",
      data: stringToUint8(documentRelsXml(imageEntries))
    },
    {
      name: "word/styles.xml",
      data: stringToUint8(stylesXml())
    },
    {
      name: "docProps/core.xml",
      data: stringToUint8(corePropsXml(note))
    },
    {
      name: "docProps/app.xml",
      data: stringToUint8(appPropsXml())
    }
  ];
  for (const image of imageEntries) {
    files.push({
      name: `word/media/${image.filename}`,
      data: image.bytes
    });
  }
  return createZip(files);
}

function toMarkdown(note) {
  const lines = [];
  const created = new Date(note.createdAt || Date.now()).toISOString();
  const updated = new Date(note.updatedAt || note.createdAt || Date.now()).toISOString();
  lines.push(`# ${note.title || "未命名笔记"}`);
  lines.push("");
  lines.push(`- 分类：${note.category || "未分类"}`);
  lines.push(`- 创建时间：${created}`);
  lines.push(`- 更新时间：${updated}`);
  lines.push("");
  if (note.body) {
    lines.push(note.body.trim());
    lines.push("");
  }
  if (note.attachments?.images?.length) {
    lines.push("## 附件");
    for (const image of note.attachments.images) {
      lines.push(
        `![attachment-${image.id}](data:${image.mimeType || "image/png"};base64,${
          image.dataUrl?.split(",")[1] ?? ""
        })`
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

function contentTypesXml(images) {
  const imageDefaults = Array.from(
    new Map(images.map((image) => [image.extension, image.mimeType])).entries()
  )
    .map(
      ([ext, mime]) =>
        `<Default Extension="${escapeXml(ext)}" ContentType="${escapeXml(mime)}"/>`
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
${imageDefaults}
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;
}

function rootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function documentRelsXml(images) {
  const imageRelationships = images
    .map(
      (image) =>
        `<Relationship Id="${escapeXml(image.relId)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${escapeXml(image.filename)}"/>`
    )
    .join("\n  ");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  ${imageRelationships}
</Relationships>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:uiPriority w:val="9"/>
    <w:qFormat/>
    <w:pPr>
      <w:outlineLvl w:val="0"/>
    </w:pPr>
  </w:style>
</w:styles>`;
}

function documentXml(note, images) {
  const paragraphs = [];
  if (note.title) {
    paragraphs.push(
      `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${escapeXml(
        note.title
      )}</w:t></w:r></w:p>`
    );
  }
  paragraphs.push(
    `<w:p><w:r><w:t xml:space="preserve">分类：${escapeXml(note.category || "未分类")}</w:t></w:r></w:p>`
  );
  const created = new Date(note.createdAt || Date.now()).toISOString();
  const updated = new Date(note.updatedAt || note.createdAt || Date.now()).toISOString();
  paragraphs.push(
    `<w:p><w:r><w:t xml:space="preserve">创建时间：${escapeXml(created)}</w:t></w:r></w:p>`
  );
  paragraphs.push(
    `<w:p><w:r><w:t xml:space="preserve">更新时间：${escapeXml(updated)}</w:t></w:r></w:p>`
  );
  paragraphs.push(`<w:p/>`);

  const body = note.body || "";
  const sections = body.split(/\n{2,}/);
  for (const section of sections) {
    const lines = section.split(/\r?\n/);
    const runs = lines
      .map((line) => `<w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`)
      .join("<w:br/>");
    paragraphs.push(`<w:p>${runs}</w:p>`);
  }

  if (images.length) {
    paragraphs.push(`<w:p><w:r><w:t>附件</w:t></w:r></w:p>`);
    for (const image of images) {
      paragraphs.push(imageParagraph(image));
    }
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
  mc:Ignorable="w14 wp14">
  <w:body>
    ${paragraphs.join("\n    ")}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
      <w:cols w:space="708"/>
      <w:docGrid w:type="lines" w:linePitch="360"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function corePropsXml(note) {
  const created = new Date(note.createdAt || Date.now()).toISOString();
  const modified = new Date(note.updatedAt || note.createdAt || Date.now()).toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:dcmitype="http://purl.org/dc/dcmitype/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(note.title || "Quick Insight Note")}</dc:title>
  <dc:subject>Quick Insight Notes Export</dc:subject>
  <dc:creator>Quick Insight Notes</dc:creator>
  <cp:keywords>${escapeXml(note.category || "note")}</cp:keywords>
  <cp:lastModifiedBy>Quick Insight Notes</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${modified}</dcterms:modified>
</cp:coreProperties>`;
}

function appPropsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
  xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Quick Insight Notes</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <Company></Company>
  <LinksUpToDate>false</LinksUpToDate>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
  <AppVersion>16.0000</AppVersion>
</Properties>`;
}

function prepareImageEntries(images) {
  const DEFAULT_WIDTH_PX = 720;
  const DEFAULT_HEIGHT_PX = 480;
  return images
    .map((image, index) => {
      if (!image?.dataUrl) {
        return null;
      }
      try {
        const { mimeType, bytes } = dataUrlToUint8(image.dataUrl);
        const fallbackMime =
          mimeType && mimeType.startsWith("image/")
            ? mimeType
            : image.mimeType && image.mimeType.startsWith("image/")
            ? image.mimeType
            : "image/png";
        const extension = inferImageExtension(fallbackMime);
        const filename = `image${index + 1}.${extension}`;
        const widthPx = image.width || DEFAULT_WIDTH_PX;
        const heightPx =
          image.height || Math.round((DEFAULT_HEIGHT_PX / DEFAULT_WIDTH_PX) * widthPx);
        const widthEmu = Math.max(1, Math.round(widthPx * 9525));
        const heightEmu = Math.max(1, Math.round(heightPx * 9525));
        return {
          relId: `rId${index + 2}`,
          filename,
          mimeType: fallbackMime,
          extension,
          bytes,
          widthEmu,
          heightEmu,
          docPrId: index + 1,
          title: image.title || image.id || `Image ${index + 1}`
        };
      } catch (error) {
        console.warn("Skipping attachment during DOCX export", error);
        return null;
      }
    })
    .filter(Boolean);
}

function imageParagraph(image) {
  return `<w:p>
      <w:r>
        <w:drawing>
          <wp:inline distT="0" distB="0" distL="0" distR="0">
            <wp:extent cx="${image.widthEmu}" cy="${image.heightEmu}"/>
            <wp:docPr id="${image.docPrId}" name="${escapeXml(image.title)}"/>
            <wp:cNvGraphicFramePr>
              <a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>
            </wp:cNvGraphicFramePr>
            <a:graphic>
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:pic>
                  <pic:nvPicPr>
                    <pic:cNvPr id="${image.docPrId}" name="${escapeXml(image.filename)}"/>
                    <pic:cNvPicPr/>
                  </pic:nvPicPr>
                  <pic:blipFill>
                    <a:blip r:embed="${image.relId}"/>
                    <a:stretch>
                      <a:fillRect/>
                    </a:stretch>
                  </pic:blipFill>
                  <pic:spPr>
                    <a:xfrm>
                      <a:off x="0" y="0"/>
                      <a:ext cx="${image.widthEmu}" cy="${image.heightEmu}"/>
                    </a:xfrm>
                    <a:prstGeom prst="rect">
                      <a:avLst/>
                    </a:prstGeom>
                  </pic:spPr>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>`;
}
