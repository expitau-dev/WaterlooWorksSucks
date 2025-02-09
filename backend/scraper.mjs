import puppeteer from 'puppeteer';
import fs from 'fs';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

let filepath = process.env.API_DATA_PATH
let existingKeys = Object.keys(JSON.parse(fs.readFileSync(filepath, 'utf8')));

let foundKeys = [];
let currentPage = 1;
let preparingToExit = false;

(async () => {
    // const browser = await puppeteer.launch({ headless: false, slowMo: 25 });
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto('https://waterlooworks.uwaterloo.ca/notLoggedIn.htm');
    async function clickButton(text, type = 'a') {
        console.log(`Clicking button '${text}'`)
        let button = await page.waitForXPath(`//${type}[text()='${text}']`)
        await button.evaluate(b => b.click());
    }
    await clickButton('Log Into WaterlooWorks')
    await clickButton('Students/Alumni/Staff')
    await page.waitForSelector('#userNameInput')
    await page.type('#userNameInput', process.env.WW_USERNAME)
    await clickButton('Next', 'span')
    await page.waitForSelector('#passwordInput')
    await page.type('#passwordInput', process.env.WW_PASSWORD)
    await clickButton('Sign in', 'span')
    // Duo push happens here
    await page.waitForSelector(".verification-code")
    console.log("Duo code: " + await page.evaluate(() => {
        const element = document.querySelector(".verification-code")
        return element ? element.textContent : 'not found';
    }))
    await (await page.waitForSelector('#trust-browser-button')).click()
    console.log("Success!")
    await (await page.waitForSelector(`[aria-label="Toggle Main Menu"]`)).click()
    await clickButton('Co-op Jobs')
    await clickButton('View jobs')
    await (await page.waitForSelector(`[value="Search"]`)).click()
    while (true) {
        async function saveLink(link) {
            const newPagePromise = new Promise(x => browser.once('targetcreated', target => x(target.page())));
            await link.evaluate(b => b.click());;
            const page2 = await newPagePromise;
            await page2.bringToFront();
            await page2.waitForSelector("#postingDiv");
            // await new Promise(r => setTimeout(r, 3000));
            function save() {
                function postJSON(data, path = '/') {
                    let url = "http://localhost:3000";
                    let xhr = new XMLHttpRequest();
                    xhr.open("POST", url + path, true);
                    xhr.setRequestHeader("Content-Type", "application/json");
                    xhr.onreadystatechange = function () {
                        if (xhr.readyState === 4 && xhr.status === 200) {
                            var json = JSON.parse(xhr.responseText);
                        }
                    };
                    let strjson = JSON.stringify(data);
                    xhr.send(strjson);
                }

                let id = document.getElementsByClassName("dashboard-header__profile-information")[0].children[0].textContent.split("-")[0].trim();
                let outerobj = {};
                let tables = Array.from(document.querySelector("#postingDiv").children).filter(x => Array.from(x.classList).includes("panel-default")).map(x => { let obj = {}; let innerobj = {}; Array.from(x.children[1].children[0].children[0].children).forEach(y => { innerobj[y.children[0].textContent.trim()] = y.children[1].textContent.trim(); }); obj[x.children[0].textContent.trim()] = innerobj; return obj });
                tables.forEach(x => {
                    for (const [key, value] of Object.entries(x)) {
                        outerobj[key] = value;
                    }
                });
                let arr = {};
                arr[id] = outerobj;

                postJSON(arr);
            }
            await page2.evaluate(save)
            await page2.close()
        }

        await page.waitForSelector('tr td.orgDivTitleMaxWidth a')
        let linkIds = await page.evaluate(() => { return Array.from(document.querySelectorAll('tr td.orgDivTitleMaxWidth a')).map(link => link.closest('tr').children[2].innerHTML) })
        let links = await page.$$('tr td.orgDivTitleMaxWidth a')
        for (let i in links) {
            foundKeys.push(linkIds[i])
            if (!existingKeys.includes(linkIds[i])) {
                console.log("Saving ", i)
                await saveLink(links[i])
            }
        }
        let lastPage = currentPage
        let button = await page.waitForXPath(`//a[contains(., '»')]`)
        await button.evaluate(b => b.click());
        await new Promise(r => setTimeout(r, 2000));
        currentPage = await page.evaluate(() => { return document.querySelector("div.pagination ul li.active a").innerHTML.trim() })
        if (lastPage == currentPage && preparingToExit) {
            console.log(JSON.stringify(existingKeys.filter(x => !foundKeys.includes(x))))
            await fetch('http://localhost:3000/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                    // Add any additional headers as needed
                },
                body: JSON.stringify(foundKeys)
            })
            return
        } else if (lastPage == currentPage) {
            preparingToExit = true
            console.log("Preparing to exit...")
        } else {
            console.log(`Select page -- ${currentPage}`)
        }
    }
})();
