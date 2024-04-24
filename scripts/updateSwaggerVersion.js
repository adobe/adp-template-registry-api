/*
Copyright 2024 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/
const fs = require('fs')
const path = require('path')

async function main () {
    const newVersion = process.env.npm_package_version
    const templateRegistryApiPath = path.resolve(__dirname, '../template-registry-api.json')
    const templateRegistryApi = require(templateRegistryApiPath)
    templateRegistryApi.info.version = newVersion
    fs.writeFileSync(templateRegistryApiPath, JSON.stringify(templateRegistryApi, null, 2))
}

main()
    .catch(console.error)
