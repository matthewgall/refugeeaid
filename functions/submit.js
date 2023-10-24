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

    // Now we record the submission data
    let submissionData = {
        'firstName': formData.get('firstName', ''),
        'lastName': formData.get('lastName', ''),
        'othersName': formData.getAll('othersName').join(', ') || '',
        'email': formData.get('email', null),
        'phoneNumber': formData.get('phoneNumber', ''),
        'locationDescription': formData.get('locationDescription', ''),
        'need': formData.get('need', ''),
        'otherNeed': formData.get('otherNeed', ''),
        'usCitizen': formData.get('usCitizen', 'No'),
        'latitude': formData.get('latitude') || null,
        'longitude': formData.get('longitude') || null,
        'files': [],
        'createdAt': Math.floor(new Date().getTime() / 1000)
    }

    // Check for location data
    if (submissionData.latitude == 'Location not retrieved') submissionData.latitude = null
    if (submissionData.longitude == 'Location not retrieved') submissionData.longitude = null

    // Do some content type checks
    if (submissionData.email !== null && !isEmail(submissionData.email)) {
        resp.message = `You provided an e-mail address that is invalid`
        return new Response(JSON.stringify(resp), {status: 400, headers: {'Content-Type': 'application/json'}})
    }

    if (!['Yes', 'No'].includes(submissionData.usCitizen)) {
        resp.message = `You provided an invalid US citizen status`
        return new Response(JSON.stringify(resp), {status: 400, headers: {'Content-Type': 'application/json'}})
    }

    // And get ready to upload our files
    let photos = formData.getAll('photos', []);
    if (photos.length > 0) {
        // We allow at maximum 5 photos
        if (photos.length > 5) {
            resp.message = `You provided too many images, please upload a maximum of 5 images only`
            return new Response(JSON.stringify(resp), {status: 400, headers: {'Content-Type': 'application/json'}})
        }

        for(let p of photos) {
            // We have to iterate through them and save
            let uuid = nanoid();
            let data = await p.arrayBuffer();
            await env.R2.put(uuid, data);
            submissionData.files.push(uuid);
        }
    }

    // Ready to insert into D1
    let query;
    try {
        query = await env.DB.prepare('INSERT INTO SOSRequest (first_name, last_name, others_name, email, phone_number, location_description, need, other_need, us_citizen, latitude, longitude, photo_urls, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)').bind(
            submissionData.firstName,
            submissionData.lastName,
            submissionData.othersName,
            submissionData.email,
            submissionData.phoneNumber,
            submissionData.locationDescription,
            submissionData.need,
            submissionData.otherNeed,
            submissionData.usCitizen,
            submissionData.latitude,
            submissionData.longitude,
            submissionData.files.join(','),
            submissionData.createdAt
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
        if (submissionData.latitude && submissionData.longitude) {
            google_maps_link = `https://www.google.com/maps/search/${submissionData.latitude},${submissionData.longitude}`
            location_display = `<${google_maps_link}|Map> - Latitude: ${submissionData.latitude}, Longitude: ${submissionData.longitude}`
        }

        let file_display = []
        for (let f of submissionData.files) {
            file_display.push(`https://refugeeaid-pages.pages.dev/uploads/${f}`)
        }

        let slackBody = `*Date (UTC)*: ${new Date(submissionData.createdAt * 1e3).toISOString()}
        *First Name*: ${submissionData.firstName}
        *Last Name*: ${submissionData.lastName}
        *Other Names*: ${submissionData.othersName}
        *Email*: ${submissionData.email}
        *Phone Number*: ${submissionData.phoneNumber}
        *Location Description*: ${submissionData.locationDescription}
        *Need*: ${submissionData.need}
        *Other Need*: ${submissionData.otherNeed}
        *US Citizen*: ${submissionData.usCitizen}
        *Location*: ${location_display}
        *Photo URLs*: ${file_display.join(',')}
        `

        for (let s of env.SLACK_WEBHOOK.split(',')) {
            let slack = await fetch(s, {
                method: 'POST',
                headers: {
                    'User-Agent': 'refugeeaid/worker'
                },
                body: JSON.stringify({'text': slackBody})
            })

            if (!slack.ok) {
                console.log(`Encountered an error while posting to SLACK_WEBHOOK: ${e}`)
            }
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