const express = require("express");
const router = express.Router();

// Mongodb user model
const User = require("./../models/User");

// Mongodb user verification model
const UserVerification = require("./../models/UserVerification");

// Mongodb password reset model
const PasswordReset = require("./../models/PasswordReset");

// email handler
const nodemailer = require('nodemailer');


// unique string
const { v4: uuidv4 } = require("uuid");

// env variables
require('dotenv').config();

// Password handler
const bcrypt = require('bcrypt');

// path for static verified page
const path = require("path");

// nodemailer 
let transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.AUTH_EMAIL,
        pass: process.env.AUTH_PASS,
    },
});

// testing success
transporter.verify((error, success) => {
    if (error) {
        console.log(error);
    } else {
        console.log("Ready for message");
        console.log(success);
    }
});

//Signup
router.post('/signup', (req, res) => {
    let {name, email, password, dateOfBirth} = req.body;
    name = name.trim();
    email = email.trim();
    password = password.trim();
    dateOfBirth = dateOfBirth.trim();

    if (name == "" || email == "" || password =="" || dateOfBirth =="") {
        res.json({
            status: "FAILED",
            message: "Empty input fields!"
        });
    } else if (!/^[a-zA-Z ]*$/.test(name)) {
        res.json({
            status: "FAILED",
            message: "Invalid name entered"
        })
    } else if (!/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email)) {
        res.json({
            status: "FAILED",
            message: "Invalid email entered"
        })
    } else if (!new Date(dateOfBirth).getTime()) {
        res.json({
            status: "FAILED",
            message: "Invalid date of birth entered"
        })
    } else if (password.length < 8) {
        res.json({
            status: "FAILED",
            message: "Password is too short!"
        })
    } else {

        // Cheking if user already exists
        User.find({email}).then(result => {
            if (result.length) {
                // A user already exists
                res.json({
                    status: "FAILED",
                    message: "User with the provided email already exists"
                })
            } else {
                //Try to create new user

                // password handling
                const saltRounds = 10;
                bcrypt.hash(password, saltRounds).then(hashedPassword => {
                    const newUser = new User({
                        name,
                        email,
                        password: hashedPassword,
                        dateOfBirth,
                        verified: false,
                    });

                    newUser
                    .save()
                    .then(result => {
                        // handle account verification
                        sendVerificationEmail(result, res);
                    })
                    .catch(err => {
                        res.json({
                            status: "FAILED",
                            message: "An error occured while saving user account!"
                        });

                    });

                })
                .catch(err => {
                    res.json({
                        status: "FAILED",
                        message: "An error occured while hashing password!"
                    })
                })
            }


        }).catch(err => {
            console.log(err);
            res.json({
                status: "FAILED",
                message: "An error occured while checking for existing user!"
            });
        });


        

    }
});

// send verification email
const sendVerificationEmail = ({_id, email}, res) => {
    // url to be used in the email
    const currentUrl = "http://localhost:5000/";

    const uniqueString = uuidv4() + _id;

    // mail options
    const mailOptions = {
        from: process.env.AUTH_EMAIL,
        to: email,
        subject: "Verify Your Email",
        html: '<p>Verify your email address to complete the signup and login into your account</p><p>This link <b>expires in 6 hours</b>.</p><p>Press <a href=${currentUrl + "user/verify/" + _id + "/" + uniqueString}>here</a> to proceed. </p>',
          
    };

    // hash the uniqueString
    const saltRounds = 10;
    bcrypt
       .hash(uniqueString, saltRounds)
       .then((hashedUniqueString) => {
        // set values in userVerification collection
        const newVerification = new UserVerification({
            userId: _id,
            uniqueString: hashedUniqueString,
            createdAt: Date.now(),
            expiresAt: Date.now() + 21600000,
        });

    

         newVerification
         .save()
         .then(() => {
            transporter
            .sendMail(mailOptions)
            .then(() => {
                // email sent and verification record saved
                res.json({
                    status: "PENDING",
                    message: "Verification email sent",
                 });
            })
            .catch((error) => {
                console.log(error);
                res.json({
                    status: "Failed",
                    message: "Verification email failed",
                });
            })
         })
         .catch((error) => {
            console.log(error);
            res.json({
                status: "Failed",
                message: "Couldn't save verification email data!",
             });
         })
       })
       .catch(() => {
         res.json({
            status: "Failed",
            message: "An error occured while hashing email data!",
         });
       })
};

// verify email
router.get("/verify/:userId/uniqueString", (req, res) => {
  let { userId, uniqueString } = req.params;

  UserVerification
  .find({userId})
  .then((result) => {
    if (result.length > 0) {
        // user verification record exists and we procceed

        const {expiresAt} = result[0];
        const hashedUniqueString = result[0].uniqueString;

        // checking for expired unique string
        
        if (expiresAt < Date.now()) {
            // record has expired so we delete it
            UserVerification
            .deleteOne({ userId})
            .then(result => {
                User
                .deleteOne({_id: userId})
                .then(() => {
                    let message = "Link has expired. Please sign up again.";
                    res.redirect('/user/verified/error=true&message=${message}');

                })
                .catch(error => {
                    let message = "Clearing user with expired unique string failed ";
                    res.redirect('/user/verified/error=true&message=${message}');
                })

            })
            .catch((error) => {
                let message = "An error occured while clearing expired user verification record";
                res.redirect('/user/verified/error=true&message=${message}');

            })

        } else {
            // valid record exists so we validate the user string
            // Fist compare the hashed unique string

            bcrypt
            .compare(uniqueString, hashedUniqueString)
            .then(result => {
                if (result) {
                    // strings match

                    User
                    .updateOne({_id: userId}, {verified: true})
                    .then(() => {
                        UserVerification
                        .deleteOne({userId})
                        .then(() => {
                            res.sendFile(path.join(__dirname, "./../views/verified.html"));
                        })
                        .catch(error => {
                            console.log(error);
                            let message = "An error occured while finalizing successful verification.";
                            res.redirect('/user/verified/error=true&message=${message}');
                        })
                    })
                    .catch(error => {
                        console.log(error);
                        let message = "An error occured while updating user record to show verified.";
                        res.redirect('/user/verified/error=true&message=${message}');
                    })

                } else {
                    //existing record but incorrect verification details passed
                    let message = "Invalid verification details passed, Check your inbox.";
                    res.redirect('/user/verified/error=true&message=${message}');
                }
            }) 
            .catch(error => {
                let message = "An error occured while comparing unique strings";
                res.redirect('/user/verified/error=true&message=${message}');
            })
        }
    } else {
        // user verification record doesnn't exist
        let message = "Account record doesn't exist or has been verified already, Please sign up or log in.";
        res.redirect('/user/verified/error=true&message=${message}');
    }
  })
  .catch((error) => {
    console.log(error);
    let message = "An error occurred while checking for existing user verification record";
    res.redirect('/user/verified/error=true&message=${message}');

  })
});

// Verified page route
router.get("/verified", (req, res) => {
  req.sendFile(path.join(__dirname, "./../views/verified.html"));
})

//signin
router.post('/signin', (req, res) => {
    let { email, password} = req.body;
    email = email.trim();
    password = password.trim();

    if (email == "" || password == "") {
        res.json({
            status: "Failed",
            message: "Empty creditials supplied"
        });

    } else {
        // Check if the user exists
        User.find({email})
        .then(data => {
            if (data.length) {
                //user exists

                //check if user is verified
                if (!data[0].verified) {
                    res.json({
                        status: "FAILED",
                        message: "Email hasn't been verified yet, check your inbox",
                    });

                } else {
                    const hashedPassword = data[0].password;
                    bcrypt.compare(password, hashedPassword).then(result => {
                        if (result) {
                            // Password match
                            res.json({
                                status: "SUCCESS",
                                message: "Signin successful",
                                data: data
                            })
                        } else {
                            res.json({
                                status: "FAILED",
                                message: "Invalid password entered!"
                            })
                        }
    
                    })
                    .catch(err => {
    
                        res.json({
                            status: "FAILED",
                            message: "An error occured while comparing passwords"
                        });
    
                    });

                }

                const hashedPassword = data[0].password;
                bcrypt.compare(password, hashedPassword).then(result => {
                    if (result) {
                        // Password match
                        res.json({
                            status: "SUCCESS",
                            message: "Signin successful",
                            data: data
                        })
                    } else {
                        res.json({
                            status: "FAILED",
                            message: "Invalid password entered!"
                        })
                    }

                })
                .redirect(".../finances/finances")
                .catch(err => {

                    res.json({
                        status: "FAILED",
                        message: "An error occured while comparing passwords"
                    });

                });

            } else {
                res.json({
                    status: "Failed",
                    message: "Invalid creditials entered!"
                })
            }
        })
        .catch(err => {
            res.json({
                status: "FAILED",
                message: "An error occured while checking for existing user"
            });
        });
    }
})

module.exports = router;

// Password reset 
router.post("/requestPasswordReset", (req, res) => {
    const {email, redirectUrl} = req.body;

    User
    .find({email})
    .then((data) => {
       if (data.length) {
        // user exists

        // check if user is verified

        if (!data[0].verified) {
            res.json({
                status: "FAILED",
                message: "Emil hasn't been verified, check your inbox!"
            });
        } else {
            // proceed with email to reset password
            sendResetEmail(data[0], redirectUrl, res);
        }

       } else {
        res.json({
            status: "FAILED",
            message: "No account with the provided email exists."
        });
       }
    })
    .catch(error => {
       console.log(error);
       res.json({
        status: "FAILED",
        message: "No account with the provided email exists.",
    });
    })
})

// send password reset email
const sendResetEmail = ({_id, email}, redirectUrl, res) => {
    const resetString = uuidv4() + _id;

    PasswordReset.deleteMany({ userId: _id})
    .then(result => {
        // records deleted successfully
        // mail options
        const mailOptions = {
        from: process.env.AUTH_EMAIL,
        to: email,
        subject: "Password Reset",
        html: '<p>It seems like you have lost the password </p> <p>use the link below to reset it.</p> <p>This link <b> expires in 60 minutes </b>.</p><p>Press <a href=${redirectUrl + "/" + _id + "/" + resetString}>here</a> to proceed. </p>',
          
    };

    // hash the reset string
    const saltRounds = 10;
    bcrypt
    .hash(resetString, saltRounds)
    .then(hashedResetString => {
        // set values
        const newPasswordReset = new PasswordReset({
            userId: _id,
            resetString: hashedResetString,
            createdAt: Date.now(),
            expiresAt: Date.now() + 3600000
        });

        newPasswordReset
        .save()
        .then(() => {
            transporter
            .sendMail(mailOptions)
            .then(() => {
                res.json({
                    status: "Pending",
                    message: "Password reset email sent",
                });
            })
            .catch(error => {
                res.json({
                    status: "FAILED",
                    message: "Password reset email failed",
                });
            })
        })
        .catch(error => {
            console.log(error);
            res.json({
                status: "FAILED",
                message: "Couldn't save reseted password",
            });
        })
    })
    .catch(error => {
        console.log(error);
        res.json({
            status: "FAILED",
            message: "An error occured while reseting the pass.",
        });
    })

    })
    .catch(error => {
       console.log(error);
          res.json({
          status: "FAILED",
          message: "Clearing existing password failed.",
        });
       
    })

}

// post request reset password 
router.post("/resetPassword", (req, res) => {
   let {userId, resetString, newPassword} = req.body;

   PasswordReset
   .find({userId})
   .then(result => {
    if (result.length > 0) {

        const {expiresAt} = result[0];
        const hashedResetString = result[0].resetString;

        if (expiresAt < Date.now()) {
            PasswordReset
            .deleteOne({userId})
            .then(() => {
                res.json({
                    status: "FAILED",
                    message: "Password reset link has expired",
                  });
            })
            .catch(error => {
                console.log(error);
                res.json({
                    status: "FAILED",
                    message: "clearing password reset record failed :(",
                  });
            })

        } else {

            bcrypt
            .compare(resetString, hashedResetString)
            .then((result) => {
                if (result) {
                    const saltRounds = 10;
                    bcrypt
                    .hash(newPassword, saltRounds)
                    .then(hashedNewPassword => {
                        User
                        .updateOne({_id: userId}, {password: hashedNewPassword})
                        .then(() => {
                            // update complete... now deleting reset record
                            PasswordReset
                            .deleteOne({userId})
                            .then(() => {
                                res.json({
                                    status: "SUCCESS",
                                    message: "your password has been reset.",
                                  });

                            })
                            .catch(error => {
                                console.log(error);
                                res.json({
                                    status: "FAILED",
                                    message: "An error occured while finalizing password reset :(",
                                  });
                            })
                        })
                        .catch(error => {
                            console.log(error);
                            res.json({
                                status: "FAILED",
                                message: "Updating user password failed.",
                              });
                        })
                    })
                    .catch(error => {
                        console.log(error);
                        res.json({
                            status: "FAILED",
                            message: "An error occured while hashing the new password",
                          });
                    })

                } else {
                    res.json({
                        status: "FAILED",
                        message: "Invalid password reset details passed",
                    });
                }

            })
            .catch(error => {
                res.json({
                    status: "FAILED",
                    message: "comparing passwords failed",
                  });
            })

        }

    } else {
        // password reset record doesnt exists
        res.json({
            status: "FAILED",
            message: "Password reset request not found",
          });
    }
   })
   .catch(error => {
    console.log(error);
       res.json({
       status: "FAILED",
       message: "Checking for password reset failed",
     });
    
 })
})


// POST EXAMPLE
// {
//     "name": "Giorgi Kakaladze",
//     "email": "giokakaladze4@gmail.com",
//     "password": "sweeftsweeft123",
//     "dateOfBirth": "12-21-2003"
// }


//  PASSWORD RESET POST EXAMPLE 
//  {
//      "userId": ".......",
//      "resetString": "........",
//      "newPassword": "Sweeft2023"
//  }