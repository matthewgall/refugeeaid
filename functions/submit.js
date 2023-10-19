import {nanoid} from 'nanoid';
import isEmail from 'validator/lib/isEmail';

export async function handle({ request, env }) {
    let resp = {
        'success': false
    }

    // This endpoint supports POST only
    if (request.method !== 'POST') {
        resp.message = `${request.method} is not allowed on this endpoint`
        return new Response(JSON.stringify(resp), {status: 400, headers: {'Content-Type': 'application/json'}})
    }

    // Now they're out the way, we check for formdata
    let formData;
    try {
        formData = await request.formData();
        if (!formData) {
            resp.message = `No formData was provided`
            return new Response(JSON.stringify(resp), {status: 400, headers: {'Content-Type': 'application/json'}})
        }
    }
    catch(e) {
        resp.message = e.message
        return new Response(JSON.stringify(resp), {status: 400, headers: {'Content-Type': 'application/json'}})
    }

    if (formData.keys().length == 0) {
        resp.message = `No formData was provided`
        return new Response(JSON.stringify(resp), {status: 400, headers: {'Content-Type': 'application/json'}})
    }

    // Now we record the submission time
    let submission_time = Math.floor(new Date().getTime() / 1000)

    // Check for location data
    let latitude = formData.get('latitude') || null
    let longitude = formData.get('longitude') || null

    if (latitude == 'Location not retrieved') latitude = null
    if (longitude == 'Location not retrieved') longitude = null

    // Do some content type checks
    let email = formData.get('email', null)
    if (email !== null && !isEmail(email)) {
        resp.message = `You provided an e-mail address that is invalid`
        return new Response(JSON.stringify(resp), {status: 400, headers: {'Content-Type': 'application/json'}})
    }

    // And get ready to upload our files
    let files = [];
    let photos = formData.getAll('photos', []);
    if (photos.length < 0) {
        // We allow at maximum 5 photos
        if (photos.length >= 5) {
            resp.message = `You provided too many images, please upload a maximum of 5 images only`
            return new Response(JSON.stringify(resp), {status: 400, headers: {'Content-Type': 'application/json'}})
        }

        for(let p of photos) {
            // We have to iterate through them and save
            let uuid = nanoid();
            let data = await p.arrayBuffer();
            await env.R2.put(uuid, data);
            files.push(uuid);
        }
    }

    // Ready to insert into D1
    let query;
    try {
        query = await env.DB.prepare('INSERT INTO SOSRequest (first_name, last_name, others_name, email, phone_number, location_description, need, other_need, us_citizen, latitude, longitude, photo_urls, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)').bind(
            formData.get('firstName', ''),
            formData.get('lastName', ''),
            formData.getAll('othersName').join(',') || '',
            email,
            formData.get('phoneNumber', ''),
            formData.get('locationDescription', ''),
            formData.get('need', ''),
            formData.get('otherNeed', ''),
            formData.get('usCitizen', 'No'),
            latitude,
            longitude,
            files.join(','),
            submission_time
        ).run()
    }
    catch(e) {
        resp.message = `We encountered an error while inserting data into our database. Please try again later`
        return new Response(JSON.stringify(resp), {status: 500, headers: {'Content-Type': 'application/json'}})
    }

    // Check if the insertion was successful
    if (!query.success) {
        resp.message = `We encountered an error while inserting data into our database. Please try again later`
        return new Response(JSON.stringify(resp), {status: 500, headers: {'Content-Type': 'application/json'}})
    }

    // Next, if we inserted, and a SLACK_WEBHOOK is set, we can notify Slack
    if (query.success && env.SLACK_WEBHOOK) {
        let google_maps_link = "None"
        let location_display = "None"
        if (latitude && longitude) {
            google_maps_link = `https://www.google.com/maps/search/${latitude},${longitude}`
            location_display = `<${google_maps_link}|Map> - Latitude: ${latitude}, Longitude: ${longitude}`
        }

        let file_display = []
        for (let f of files) {
            file_display.push(`https://refugeeaid-pages.pages.dev/uploads/${f}`)
        }

        let slackBody = `*Date (UTC)*: ${new Date(submission_time * 1e3).toISOString()}
*First Name*: ${formData.get('firstName', '')}
*Last Name*: ${formData.get('lastName', '')}
*Other Names*: ${formData.getAll('othersName').join(',') || ''}
*Email*: ${email}
*Phone Number*: ${formData.get('phoneNumber', '')}
*Location Description*: ${formData.get('locationDescription', '')}
*Need*: ${formData.get('need', '')}
*Other Need*: ${formData.get('otherNeed', '')}
*US Citizen*: ${formData.get('usCitizen', 'No')}
*Location*: ${location_display}
*Photo URLs*: ${file_display.join(', ')}
`

        let slack = await fetch(env.SLACK_WEBHOOK, {
            method: 'POST',
            headers: {
                'User-Agent': 'refugeeaid/worker'
            },
            body: JSON.stringify({'text': slackBody})
        })
        if (!slack.ok) {
            console.log()
        }
    }

    // And we did it, so return a success response
    resp.success = true;
    resp.message = "SOS request saved successfully";
    return new Response(JSON.stringify(resp), {headers: {'Content-Type': 'application/json'}});
}

export async function onRequest({ request, env }) {
	return await handle({ request, env });
}