import * as fs from 'fs-extra'
import * as path from 'path'
import { Reporter } from 'gatsby'
import { loadDocuments, DocumentFile } from 'graphql-toolkit'
import { codegen } from '@graphql-codegen/core'
import { printSchema, parse, GraphQLSchema } from 'graphql'
import { plugin as typescriptPlugin } from '@graphql-codegen/typescript'
import { plugin as operationsPlugin } from '@graphql-codegen/typescript-operations'

interface IInitialConfig {
  directory: string;
  fileName: string;
  reporter: Reporter;
}

type CreateConfigFromSchema = (schema: GraphQLSchema) => Promise<any>
type CreateConfig = (args: IInitialConfig) => Promise<CreateConfigFromSchema>
const createConfig: CreateConfig = async ({ directory, fileName, reporter }) => {
  // file name & location
  const pathToFile = path.join(directory, fileName)
  const { dir } = path.parse(pathToFile)
  await fs.ensureDir(dir)

  return async (schema) => {
    // documents
    const docPromises = [
      './src/**/*.{ts,tsx}',
      './node_modules/gatsby-*/**/*.js',
    ].map(async docGlob => {
      const _docGlob = path.join(directory, docGlob)
      return loadDocuments(_docGlob).catch(err => {
        reporter.warn('[gatsby-plugin-graphql-codegen] ' + err.message)
      })
    })
    const results = await Promise.all(docPromises)
    const documents = results.reduce((acc, cur) => {
      if (!cur) return acc
      return (acc as DocumentFile[]).concat(cur)
    }, [])

    return {
      filename: pathToFile,
      schema: parse(printSchema(schema)),
      plugins: [{
        typescript: {
          skipTypename: true,
          enumsAsTypes: true,
        },
      }, {
        typescriptOperation: {
          skipTypename: true,
        },
      }],
      documents,
      pluginMap: {
        typescript: {
          plugin: typescriptPlugin
        },
        typescriptOperation: {
          plugin: operationsPlugin
        }
      }
    }
  }
}

type GenerateFromSchema = (schema: GraphQLSchema) => Promise<void>
type GenerateWithConfig = (initalOptions: IInitialConfig) => Promise<GenerateFromSchema>
export const generateWithConfig: GenerateWithConfig = async (initalOptions) => {
  const createConfigFromSchema = await createConfig(initalOptions)
  return async (schema) => {
    const config = await createConfigFromSchema(schema)
    const output = await codegen(config)
    return fs.writeFile(config.filename, output)
  }
}
