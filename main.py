import os
from langchain_chroma import Chroma
from langchain_ollama import ChatOllama
from langchain_community.embeddings.fastembed import FastEmbedEmbeddings
from langchain_community.document_loaders import PDFPlumberLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough

#向量数据库：Chroma
#embedding模型：
# 配置
DB_DIR = "db"
PDF_DIR = "pdfs"
os.makedirs(PDF_DIR, exist_ok=True)
os.makedirs(DB_DIR, exist_ok=True)

# 初始化
print("加载Embedding模型...")
embedding = FastEmbedEmbeddings()
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1024, chunk_overlap=80
)


prompt = PromptTemplate.from_template(
    """你是一个智能助手，不要给我胡编乱造，如果没有就说希腊奶。根据以下上下文回答问题：

{context}

问题: {question}
答案:"""
)


def add_pdf(pdf_path):
    print(f"读取文件: {pdf_path}")
    loader = PDFPlumberLoader(pdf_path)
    docs = loader.load()
    print(f"加载了 {len(docs)} 页")

    chunks = text_splitter.split_documents(docs)
    print(f"切分为 {len(chunks)} 个块")


    vector_store = Chroma.from_documents(
        documents=chunks,
        embedding=embedding,
        persist_directory=DB_DIR
    )
    print("✅ 成功！")


def ask(question):
    print(f"搜索中: {question}")

    vector_store = Chroma(
        persist_directory=DB_DIR,
        embedding_function=embedding
    )

    retriever = vector_store.as_retriever(search_kwargs={"k": 5})
    llm = ChatOllama(model="qwen2.5")

    def format_docs(docs):
        return "\n\n".join(doc.page_content for doc in docs)

    rag_chain = (
            {"context": retriever | format_docs,
             "question": RunnablePassthrough()}
            | prompt
            | llm
            | StrOutputParser()
    )

    result = rag_chain.invoke(question)
    print(f"\n答案:\n{result}")


if __name__ == "__main__":
    # pdf_file = "E:\TODO\demos\pdfs\计算机科学与技术专业-2023版本人才培养方案-2023-12-20.pdf"
    # if os.path.exists(pdf_file):
    #     add_pdf(pdf_file)
    print("嗯你好")
    print("输入你的问题（输入'exit'退出）")

    while True:
        try:
            question = input("\n问题: ").strip()
            if question.lower() in ['q']:
                print("再见！")
                break
            if not question:
                continue
            ask( question)
        except KeyboardInterrupt:
            print("\n程序已中断")
            break
        except Exception as e:
            print(f"发生错误: {e}")
