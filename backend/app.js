const express = require('express');
const cors = require('cors');
const os = require('os');
const path = require('path');
const fs = require('fs');
const https = require('https');
const axios = require('axios');
const { Builder, By, until, Select } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

const app = express();
app.use(cors());
app.use(express.json());

// Custom Axios instance to bypass SSL verification
const axiosInstance = axios.create({
    httpsAgent: new https.Agent({
        rejectUnauthorized: false,
    }),
});

async function solveCaptchaWithCapsolver(base64Image) {
    try {
        const response = await axios.post('https://api.capsolver.com/createTask', {
            clientKey: 'CAP-FEAB412C38488C6D3ADACC62D6B65D0CB8F90B03DA8ADEA68D8FF48FBAD0578D', // Replace with your Capsolver API key
            task: {
                type: "ImageToTextTask",
                body: base64Image,
            },
        });

        const taskId = response.data.taskId;

        if (!taskId) {
            throw new Error(`Capsolver createTask failed: ${JSON.stringify(response.data)}`);
        }

        let solutionResponse;
        while (true) {
            await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5 seconds

            solutionResponse = await axios.post('https://api.capsolver.com/getTaskResult', {
                clientKey:env(CAP_SOLVER_API_KEY),
                taskId: taskId,
            });

            if (solutionResponse.data.status === 'ready') {
                return solutionResponse.data.solution.text;
            } else if (solutionResponse.data.status === 'processing') {
                console.log('Capsolver task still processing...');
            } else {
                throw new Error(`Capsolver getTaskResult failed: ${JSON.stringify(solutionResponse.data)}`);
            }
        }
    } catch (error) {
        console.error('Capsolver error:', error);
        throw error;
    }
}

app.post('/download', async (req, res) => {
    const { district, tahsil, village, propertyNo } = req.body;
    console.log('Received request:', { district, tahsil, village, propertyNo });

    let driver;
    try {
        driver = await new Builder().forBrowser('chrome').build();
        await driver.get('https://freesearchigrservice.maharashtra.gov.in/');

        // Close the popup if it appears
        try {
            await driver.wait(until.elementLocated(By.className('btnclose btn btn-danger')), 10000);
            await driver.findElement(By.className('btnclose btn btn-danger')).click();
            await driver.sleep(2000);
        } catch (error) {
            console.log('Popup not found or already closed.');
        }

        await driver.findElement(By.id('btnOtherdistrictSearch')).click();
        await driver.sleep(7000);

        // Select district, tahsil, village, enter property number
        const districtDropdown = await driver.findElement(By.id('ddlDistrict1'));
        const districtSelect = new Select(districtDropdown);
        await districtSelect.selectByVisibleText(district);
        await driver.sleep(5000);

        const tahsilDropdown = await driver.findElement(By.id('ddltahsil'));
        const tahsilSelect = new Select(tahsilDropdown);
        await tahsilSelect.selectByVisibleText(tahsil);
        await driver.sleep(5000);

        const villageDropdown = await driver.findElement(By.id('ddlvillage'));
        const villageSelect = new Select(villageDropdown);
        await villageSelect.selectByVisibleText(village);
        await driver.sleep(5000);

        await driver.findElement(By.id('txtAttributeValue1')).sendKeys(propertyNo);
        await driver.sleep(10000);


        // Solve captcha
        // const captchaImage = await driver.findElement(By.id('imgCaptcha_new'));
        // const captchaSrc = await captchaImage.getAttribute('src');
        // console.log('Captcha source:', captchaSrc);

        // const response = await axiosInstance.get(captchaSrc, {
        //     responseType: 'arraybuffer',
        // });
        // const base64Data = Buffer.from(response.data, 'binary').toString('base64');

        // let captchaSolved = false;
        // let attempts = 0;
        // const maxAttempts = 3;

        // while (!captchaSolved && attempts < maxAttempts) {
        //     attempts++;
        //     try {
        //         const captchaText = await solveCaptchaWithCapsolver(base64Data);
        //         await driver.findElement(By.id('txtCaptcha')).sendKeys(captchaText);
        //         captchaSolved = true;
        //     } catch (captchaError) {
        //         console.error(`Captcha solving attempt ${attempts} failed:`, captchaError);
        //         if (attempts < maxAttempts) {
        //             console.log('Retrying captcha solving...');
        //             await driver.sleep(2000);
        //         } else {
        //             console.error('Max captcha solving attempts reached.');
        //             return res.status(500).send('Captcha solving failed after multiple attempts.');
        //         }
        //     }
        // }

        // if (!captchaSolved) {
        //     return res.status(500).send('Captcha solving failed.');
        // }

        // Click search button, process page, etc.
        await driver.findElement(By.id('btnSearch_RestMaha')).click();
        await driver.sleep(10000);
        await driver.findElement(By.id('btnSearch_RestMaha')).click();
        await driver.wait(until.elementLocated(By.id('RegistrationGrid')), 30000);
        await processPage(driver);
        res.send('Download process completed.');

    } catch (error) {
        console.error('An error occurred:', error);
        res.status(500).send('An error occurred during the process.');
    } finally {
        if (driver) {
            await driver.quit();
        }
    }
});

async function processPage(driver) {
    const table = await driver.findElement(By.id('RegistrationGrid'));
    const tbody = await table.findElement(By.tagName('tbody'));
    const rows = await tbody.findElements(By.tagName('tr'));

    for (let i = 1; i < rows.length - 1; i++) {
        const row = rows[i];
        try {
            const downloadButton = await row.findElement(By.xpath(".//input[@value='IndexII']"));
            await downloadButton.click();

            const downloadPath = path.join(os.homedir(), 'Downloads');
            const downloadedFilePath = await waitForDownload(driver, downloadPath);
            console.log('Download complete:', downloadedFilePath);
        } catch (error) {
            console.error('Error downloading from row:', i, error);
        }
    }

    // Handle pagination
    try {
        const paginationRow = rows[rows.length - 1];
        const paginationTable = await paginationRow.findElement(By.tagName('table'));
        const paginationTbody = await paginationTable.findElement(By.tagName('tbody'));
        const paginationTr = await paginationTbody.findElement(By.tagName('tr'));
        const pageLinks = await paginationTr.findElements(By.tagName('td'));

        if (pageLinks.length > 0) {
            let clicked = false;
            if (await pageLinks[0].getText() === '...' && pageLinks.length > 1) {
                await pageLinks[1].click();
                await driver.sleep(2000);
                await processPage(driver);
                clicked = true;
            } else {
                for (const link of pageLinks) {
                    if (await link.getText() === '...') {
                        await link.click();
                        await driver.sleep(2000);
                        await processPage(driver);
                        clicked = true;
                        break;
                    }
                }
            }

            if (!clicked && pageLinks.length > 0) {
                await pageLinks[0].click();
                await driver.sleep(2000);
                await processPage(driver);
            } else if (!clicked) {
                console.log('No more pages (no pagination links found).');
            }
        } else {
            console.log('No more pages (no pagination links found).');
        }
    } catch (nextError) {
        console.log('No more pages or error in pagination:', nextError);
    }
}

async function waitForDownload(driver, downloadPath, timeout = 30000) {
    const startTime = Date.now();
    let previousFiles = fs.readdirSync(downloadPath);

    while (Date.now() - startTime < timeout) {
        const currentFiles = fs.readdirSync(downloadPath);
        const newFiles = currentFiles.filter(file => !previousFiles.includes(file));

        if (newFiles.length > 0) {
            const newFilePath = path.join(downloadPath, newFiles[0]);

            let previousSize = -1;
            let currentSize = fs.statSync(newFilePath).size;

            let sizeStableTime = Date.now();
            const stabilizationTimeout = 3000;

            while (Date.now() - sizeStableTime < stabilizationTimeout) {
                previousSize = currentSize;
                await driver.sleep(1000);
                currentSize = fs.statSync(newFilePath).size;

                if (previousSize === currentSize) {
                    return newFilePath;
                } else {
                    sizeStableTime = Date.now();
                }
            }
            return newFilePath;
        }

        await driver.sleep(1000);
        previousFiles = currentFiles;
    }

    throw new Error('Download timeout');
}

app.listen(5000, () => {
    console.log('Server running on port 5000');
});