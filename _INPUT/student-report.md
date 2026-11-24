# Home exercise classification on <u>a realistic dataset</u>

## Bachelor’s Thesis

## J.D. van Lieshout

### 1432168

### Supervisor dr. ing. Raoul Nuijten

### Second assessor dr. Sybren de Kinderen

### Final version

### Eindhoven, February 2022

Department of Industrial Engineering Infomation Systems research group

## Abstract

Human Pose Estimation (HPE) is a branch of computer vision that focuses on identifying the joints of the human body. In this thesis, this technology is used in combination with classification algorithms to classify fitness exercises. Research like this has been done before with promising results. However, most articles on this topic are based on data created in a lab, which is a controlled setting. Their models all claim to be very accurate. The goal of this thesis is to find out whether these models are also accurate when the data is not made in a lab but in a home setting. Therefore, videos from YouTube were used as raw data in this thesis. The results show that the models are accurate at classifying the different exercises from each other (accuracy: *±* 0.9), but not accurate at classifying the stages inside of every exercise (accuracy: *±* 0.5). Possible causes for the lower in-exercise accuracy, are the differences in camera angle and the absence of standardization. In future work, time series analysis, standardization, and camera angle detection could be implemented and tested on a realistic dataset to gain more insight into the usability of computer vision and machine learning for home exercise classification. Keywords: Human Pose Estimation, Computer vision, Machine learning, Geometric algorithm, Home exercise classification

## Contents

1.1
1.2
1.3
1.4
1.5
1.6
2

2.1
2.2
2.3
2.4
4
Human Pose Estimation.. .............................. .4
Anatomy of a fitness exercise. ............................ .5
Literature on exercise classification....... ................... .5
(Un)realistic dataset.... ............. .. .. .. .. .. .. .. ... .6
Contribution.................. .. .. .. .. .. .. .. ...... .6
Classfication algorithms................ .. .. .. .. .. .. .. .. .7

8
Overall data pipeline.. ................................ .8
Exercises and postures analyzed....... .......... .. .. .. .. .. ..9
Data collection... .............. .. .. .. .. .. .. .. ...... .9
Human Pose Estimation Algorithms...... .......... .. .. .. .. ..9

2.4.1 PoseNet......... ........................... .9
2.4.2 MoveNet.. ............... .. .. .. .. .. .. .. ..... .9
2.4.3 BlazePose. ...... .............. .. .. .. .. .. .....10
Geometric algorithm...................................11

2.5.1 Distance calculation.... ............ .. .. .. .. .. .. .. .11
2.5.2 Angle calculation. ................ .. .. .. .. .. .. .. .11
Machine learning algorithms..............................12

2.6.1 Machine learning classification........ .......... .. .. .. .12
2.6.2 Train-test datasets..... .............. .. .. .. .. .. ..12
2.6.3 K-means Nearest Neighbors...... .. ...................12
2.6.4 Logistic Regression... ............................12
2.6.5 Gradient boosting.. ..............................13
2.6.6 Random Forest.................................13
2.6.7 Neural Network.................................14
Data analysis. .....................................15

2.7.1 Confusion Matrix................................15
2.7.2 Performance indicators.... .........................15
17
Data collection... .............. .. .. .. .. .. .. .. .......17
Model comparison. ...................................17
Confusion matrices.. .................................18

3.3.1 Per exercise... .. ..............................18
3.3.2 Per posture...................................19
21
Summary of findings.. .................................21
Dataset................ .. .. .. .. .. .. .. ...........21
Limitations. .......................................21
Future work. ....... .......... .. .. .. .. .. .. .........22

2.5
2.6
2.7
3 Results

3.1
3.2
3.3
4

4.1
4.2
4.3
4.4
5

Introduction

Methods

Discussion

Conclusion

Acknowledgements24

7 Appendices

7.1 Appendix A. ......................................26
7.2 Appendix B. ......................................26
3

## 1Introduction

### 1.1Human Pose Estimation

Human Pose Estimation is a branch of computer vision that develops algorithms to identify the joints of the human body (e.g., from an image or video stream input), see Figure1. This technology has huge potential for many different applications. An example of this is how you get a bus ticket in the city of Cluj-Napoca in Romania by doing squats. In 2020, the local government of the city installed new ticket machines at bus stops. If you did 20 squats in 2 minutes in front of the camera of these new ticket machines, you got your bus ticket for free (Dimitrova,2022). This was made possible by using Human Pose Estimation and this is a great example of how it can be used to make the world a healthier place.

Figure 1: Example of Human Pose Estimation

The most promising applications of Human Pose Estimation are in the fitness industry and physical therapy programs. In the fitness industry, Human Pose Estimation can help to make exercise more available, cheaper, and enjoyable for users. Human Pose Estimation also opens up a lot of possibili- ties for physical therapy. A straightforward application is exercise classification (i.e., human activity recognition) for measuring adherence to physical therapy programs (i.e., as suggested by Singh et al., 2022and Arrowsmith et al.,2023). For example, when a physiotherapist prescribes a patient to do several different exercises a couple of times a week, an exercise classification mobile app can help the patients do the exercises correctly (Rahmadani et al.,2022), track the number of repetitions and make doing the exercises more engaging and fun. If the patients are more motivated to do the exercises and do the exercises more frequently, the patients may recover more quickly. Moreover, if the physiotherapist or doctor can look into the exercise statistics of the patients, it can help them keep an eye out for these patients and give tips when needed. This technology can save time for healthcare professionals, while it also makes revalidation more fun for patients. The technology could provide a cost-effective alternative to personal training. A mobile app to help you with your workout routine and to give you personalized advice on what you can do better is a promising use of Human Pose Estimation as suggested by Rahmadani et al.,2022. This can be a more cost-effective alternative than a human personal trainer.

### 1.2Anatomy of a fitness exercise

In order for this technology to be applied in the fitness industry, it is not enough to just estimate a human pose. One should also be able to classify a posture as part of a fitness exercise. A fitness exercise is a combination of poses, that follow each other in a particular order. For example, a push-up can not be described by one posture. A push-up consists of 2 postures, one ‘up’ posture and one ‘down’ posture. These postures both need to be classified to correctly classify an entire push-up. In the thesis, postures will be referred to in a particular way. We take push-ups as an example. The ‘up’ position of the pushup will be called pushup:1, and the ‘down’ position will be called pushup:2. In Figure2an example of both the ‘up’ and ‘down’ positions is given. The top photo is ‘up’ or pushup:1, and the bottom photo is ‘down’ or pushup:2. For a full list of all the postures and an explanation about them, see Appendix A.

Figure 2: The two stages of a pushup

### 1.3Literature on exercise classification

Some academic work was already done on the topic of exercise classification, and most of them have promising results. A paper was written by Chiddarwar et al. (2020) on the possibilities of using computer vision in yoga pose tracking. They looked into the two different ways you can let the computer recognize a yoga pose; letting the computer calculate the angle between the joint for specific poses (also known as hard coding or as a geometric algorithm) or using machine learning/deep learning on images of these yoga poses to classify these poses (Chiddarwar et al.,2020). A geometric algorithm is an algorithm that calculates the angles and distances between joints and uses this information to make specific rules for every exercise. For example, when you are in the ‘down’ position of a push-up, the angle of your elbow needs to be around 90 degrees. Ferreira et al. (2020) explored the landscape of workout repetition counting and validation. In their research, they used Human Pose Estimation and machine learning classification to classify five different cross-fit exercises. The accuracy scores obtained from their data are around 90% to 95%, which is astonishingly high (Ferreira et al.,2020). Moreover, Arrowsmith et al. (2023) made an article on using Human Pose Estimation and machine learning classification on physiotherapy exercises. The study only focuses on shoulder and lower-back exercises. The accuracy scores reported in this article are very promising again. Their best pre-trained model has accuracies of 98% and 95% for lower-back and shoulder exercises respectively (Arrowsmith et al.,2023). Chen and Yang (2020) created and tested a model that could help people with correcting their form while exercising (Chen and Yang,

2020). Eivindsen and Kristensen (2020) researched using Human Pose Estimation and a geometric algorithm to make a feedback system for the fitness exercises squat and deadlift. Their model has an average accuracy of around 80% (Eivindsen and Kristensen,2020). Singh et al. (2020) made a
5

similar form correcting software to analyze the form of a cross-fit exercise; the military press. The researchers tested three different mistakes in the form of the exercise; one arm is higher than the other (asymmetrical), whether the arms are not lifted high enough (reduced range) and if the back does not have an arch. They used four different time-series classification models. Their best classifier has an accuracy score of 81%. This is lower than other studies reported but still relatively high (Singh et al.,2022).

### 1.4(Un)realistic dataset

However, previous studies have been performed with unrealistic datasets. What is meant by an unrealistic dataset can have many different interpretations, In our case, the focus is on the size of the dataset, the diversity of the data, and how well the data simulates the real use of the model. Many of the articles on using Human Pose Estimation to classify exercises have a relatively small sample size. The model of Chen and Yang was made with a dataset of 112 total videos of the researchers themself doing four different exercises (Chen and Yang,2020). This means that there are only 28 videos on average per exercise. The article claims that it does not matter how a person orientates their body to the camera, and therefore the camera angle should not matter in their model. Eivindsen and Kristensen (2020) used only 86 videos in total for their feedback system. Moreover, only 86 video snippets of exercises were used for testing the geometric algorithm, note that the geometric algorithm does not need any training data. Also, only 4 different people were filmed for data collection and the filming was done in a controlled environment. For future work, the authors recommended having a larger and more diverse dataset (Eivindsen and Kristensen,2020). Rahmadani et al. (2022) have three different participants who all did every exercise 8 times, which totals 24 data points per exercise. Moreover, their images obeyed some very specific rules; the camera is one meter from the ground, the human in the image must be between 1.50 and 1.80 meters, and the person must be approximately

2.4 meters from the camera (Rahmadani et al.,2022). Singh et al. (2022) do have a larger sample size than most of the other studies. The dataset includes 56 participants who all performed 10 repetitions of the correct form and 10 repetitions of one of the incorrect forms. While the article claims their model is evaluated on a real-world workout activities dataset, all the videos for this research were filmed inside their own laboratory in Dublin. All the exercise repetitions were filmed from two cameras: One from the front and one from the side. However, only the front view was used for their classification model. Moreover, the camera was always in the same position relative to the participants, which ensured that the distance to the camera was roughly the same for every participant. This also indicates that the camera was always at the same height (Singh et al.,2022). The article by Arrowsmith et al. (2023) has 21 participants who all did 10 repetitions per exercise. This indicates that this study does have a relatively high amount of data points and is more in line with the sample size reported by Singh et al. (2022). However, the videos were again recorded in a lab and thus in a controlled environment. They did change the background and setting a couple of times while filming, but the position of the camera relative to the participant was specific for each exercise. Also, nothing is written about the diversity among the participants. As future work, Arrowsmith et al. (2023) indicate a classification model needs to be made on videos in a home setting instead of a lab.
### 1.5Contribution

This study aims to evaluate the performance of different classification algorithms on a realistic dataset. In particular, we have derived a dataset from 12 distinct YouTube videos that were recorded in a home setting. The people in the videos have different ethnicities, there are two videos of dark skin males, one video with an Asian male, six videos include light skin males, and three videos include light skin

females. This ensures that our dataset is diverse. Moreover, all the YouTube videos are filmed in different rooms, with different camera angles, heights of the camera, and distances from the camera.

### 1.6Classfication algorithms

The different classification algorithms that we evaluated include a geometric algorithm and multiple machine learning algorithms. Both the geometric and machine learning algorithms have their ad- vantages and disadvantages. These pros and cons can determine which one would be better in the real world. First off, the geometric algorithm needs to have a model for every exercise and every pose of that exercise. The specifications of the geometric algorithm need to be handmade for every exercise which takes a lot of time. Also, constraints are needed for every position of an exercise when using a geometric algorithm. These constraints need to be made such that the algorithm does not recognize a push-up position when you move your arms into a 90-degree angle while standing for example. Such a constraint for the down position can be that the back must be straight horizontally. While these constraints take time to identify and program, they do help the program become better. Another advantage of the geometric algorithm is that you can personalize the algorithm more than when using the machine learning algorithm. Machine learning algorithms also need a lot of training data to make a good model, while the geometric algorithm does not need to do any training at all. When using machine learning, no specifications need to be made. Therefore, it is easier to implement than a geometric algorithm.

## 2Methods

### 2.1Overall data pipeline

Figure 3: Pipeline used in this thesis

Figure3shows the pipeline that is used in this thesis. It starts with collecting workout videos on YouTube, these videos are downloaded and then uploaded in the self-made annotation interface. This tool makes step 2 of the pipeline possible. In this website, the annotations of screenshots from the videos are made. So for example when the video shows a person doing push-ups, you need to annotate the two different stages of this exercise (e.g. push-up:1 and push-up:2). When the whole video is annotated, the screenshots and their annotations are uploaded into a database. In step 3, Human Pose Estimation algorithms are used on the annotated pictures in the database. This step creates a CSV file that includes the video source, posture (exercise), stage, and coordinates of the keypoints. The file is in JSON format, which is not optimal for data analysis in Python. Therefore, some preprocessing needs to be done on this data before we start training and testing our models. The preprocessed file is 5-fold cross-validated. This means that the data is split up into 5 equally

big chunks and every group is a test set one time, and a training set the other five times. With this training and test data, the machine learning models are trained and tested. The geometric algorithm does not need any training data, and therefore only the test data is used as input. The different classification models predict for all test data what exercise and posture the algorithm thinks it is. This prediction data together with the actual exercise and postures of the test data is the input for a confusion matrix. This confusion matrix is used to find out how well each model performs.

### 2.2Exercises and postures analyzed

In this research, four different exercises are analyzed: jumping-jack, push-up, squat, and plank. The exercises jumping-jack, push-up and squat all have two different postures. These postures can be seen as the ‘up’ and ‘down positions of every exercise. The exercise plank is a static exercise with no movement, and therefore only has one posture. For an overview of all postures and a description, see Appendix A.

### 2.3Data collection

This thesis proposes two different ways of classifying fitness exercises; machine learning and geometric classification. In order to test and train these algorithms, there needs to be data. The raw collection was done on YouTube. On this video website, there are thousands of videos of people exercising or doing a specific workout. To find these types of videos, search terms such as ‘home workout’ and ‘Cardio at home’ were used. Also adding the names of the exercises helped with finding the correct videos. These videos were downloaded and then uploaded to the website where annotations of the videos could be made ([https://projectraoul.nl/research/video-annotator/videos](https://projectraoul.nl/research/video-annotator/videos)). On this website, you can click on any of the downloaded videos and start annotating the exercises. Annotation is labelling screenshots of the video to a certain exercise and the exercise stage the person is in (e.g. push-up in the ‘up‘ position or squat in the ‘down‘ position). The tool makes it easy to quickly make a lot of annotations. To store all the annotations, the cloud service Airtable is used. Here, the video source, timestamp, exercise, stage, and a screenshot of the annotated frame are stored.

### 2.4Human Pose Estimation Algorithms

The next step is to put Human Pose Estimation algorithms over the annotated screenshots. Three different algorithms were used: PoseNet, MoveNet, and BlazePose. The training and testing of the classification models is done on all three HPE algorithms to allow for comparison.

2.4.1PoseNet PoseNet is a Human Pose Estimation algorithm made by TensorFlow in 2018. This model uses the standard 17 keypoints proposed by Common Objects in Context (COCO). Figure4shows the 17 keypoints of the COCO typology. The algorithm can detect either a single or multiple persons. In this thesis, single-person detection is used (Varshney,2021).
2.4.2MoveNet MoveNet is the successor of PoseNet and is promised to be ultra-fast and reliable. MoveNet has two variants: Lightning and Thunder. The Lightning variant is faster and can be run on modern smartphones, while Thunder is more accurate but requires more computing power. MoveNet is based on the 17 keypoints defined by COCO, just like its predecessor. Jo and Kim (2022) compared PoseNet
9

and MoveNet. The results showed that MoveNet Lighting is the fastest model, while PoseNet is the most accurate (Jo and Kim,2022).

Figure 4: The 17 keypoints from Varshney,2021

2.4.3BlazePose BlazePose is an extensive model made by Google. It has 33 keypoints of the body instead of the industry standard of 17 of COCO topology. Google claims that the higher amount of keypoints make BlazePose ideal for fitness applications. However, since it has more keypoints, it also asks for more computing power from the computer or mobile device (Bazarevsky et al.,2020).
10

Figure 5: The 33 keypoints from BlazePose

### 2.5Geometric algorithm

For the geometric algorithm, two main equations were used. Angle calculation and distance calcu- lation. These equations are used to create constraints for every exercise posture. The geometric algorithm checks all constraints for each posture. The algorithm first checks whether the coordinates satisfy the constraints for jumping-jack:1, then for jumping-jack:2, then squat:1 etc. In the scenario that the constraints are satisfied for multiple postures (e.g. jumping-jack:1 and squat:1) the predicted posture will be the one that is the latest on the list. If squat:1 is tested later than jumping-jack:1, the algorithm will give squat:1 as its prediction. In the appendix, a list is available with the sequence at which the geometric algorithm tests the postures.

2.5.1Distance calculation *Da,b*is the distance calculated between keypoints a and b. The distance is calculated with the formula:
q *Da,b*= (*K*1*x− K*2*x*)2+ (*K*1*y− K*2*y*)2*,*

where *K*1 and *K*2 are two different keypoints, where *x* and *y* indicate the x and y coordinate of these keypoints.

2.5.2Angle calculation The angle calculation is straightforward. When calculating an angle of a keypoint, 2 adjacent key- points are needed. For example, when you want to calculate the angle of the elbow, you need the x and y coordinates of the shoulder, wrist, and of course the elbow. The following formula calculates the angle for keypoint *K*1:
*Angle* = *cos* *−*1 ((*D₁,*2+ *D₁,*3*− D₂,*3)*/*(2 *∗ D₁,*2*∗ D₁,*3))

Keypoints *K*2 and *K*3 are used in the formula and are 2 keypoints that are connected to *K*1. This angle calculation is used in multiple postures researched in this thesis. For push-ups, when in the ‘down’ position, the angle of the elbow needs to be around 90 degrees.

### 2.6Machine learning algorithms

2.6.1Machine learning classification The machine learning models that were used in this thesis are classification models. This means that the models can recognize and predict the pre-determined exercises based on the input data, which is the coordinate data given by the HPE. The coordinates are the ‘x’ values of the data and the exercise postures can be seen as the ‘y’ of the data.
2.6.2Train-test datasets When working with machine learning, it is necessary to have a dataset on which you train the model and a data set on which you can test the model. In order to make sure that roughly the same train-test split is used for every exercise, the data is first split per exercise posture (e.g. Squat:1) and in the end, put together into two big train and test datasets. These two datasets are used for training and testing the data on multiple different machine learning algorithms.
2.6.3K-means Nearest Neighbors K-means Nearest Neighbors (KNN) is a fairly basic machine learning algorithm. The algorithm aims to split the solution space in such a way that each exercise has its own cluster. How space is split, is determined during training. The training clusters are made based on the coordinate data. During the testing phase, the test coordinate data will be the input to the algorithm and the algorithm will find the closest cluster and give the posture of this cluster as output (Gallego et al.,2018).
Figure 6: Example of KNN from Gallego et al.,2018

2.6.4Logistic Regression Logistic regression is also a classification machine learning method. When a logistic regression is used as a binary classifier (e.g. class 0 and class 1), a sigmoid function is used. The sigmoid function explains how the values are predicted. When the independent variables are placed in the sigmoid function, it returns the probability that the prediction for class 1 is right (e.g. probability is 0.3 that the prediction is right). A threshold value for the prediction dictates from what probability the prediction will be class 1. When a new prediction probability goes over this threshold, the prediction
12

will be class 1. If it is under this threshold, the prediction is class 0. However, in a multiclass case, a softmax function is used instead of a sigmoid function. Our prediction model does have multiple classes, and therefore a softmax function is used. The softmax function computes the probability that a feature belongs to a certain class. In our case, the features are the coordinates of the keypoints, and the classes are the different postures. The prediction will be class where the probability is the highest.

Figure 7: Example of a sigmoid function from Thoma,2014

2.6.5Gradient boosting The gradient boosting classifier is a rather complex classification model. Gradient boosting starts with an initial model and adds a new model that focuses on the cases that the first model predicted poorly. This process is repeated multiple times until the new model does not decrease the prediction error of the model anymore. The classifier relies on the assumption that combining the previous model with the best new model decreases the prediction error (Natekin and Knoll,2013).
2.6.6Random Forest Random forest is an easier-to-understand machine learning method. It creates many different decision trees based on the training data. The test data iterates through all the decision trees. All the decision trees have an output variable (e.g. jumping-jack:1 or push-up:2). The random forest chooses the output that is the most common output of the decision trees. For example, there are 10 decision trees in total, 6 of these trees have jumping-jack:1 as output, 3 have push-up:1 as output and 1 has plank:1 as output. In this example, the random forest will choose jumping-jack:1 as the output for this iteration (Breiman,2001).
13

Figure 8: Example of decision tree from Song and Ying,2015

2.6.7Neural Network A neural network is a network of connected nodes with input nodes, hidden nodes, and output. The idea is that it works like a human brain. For example, when you are looking at the sunset, the input nodes can be compared to your eyes, the hidden layers are the processing neurons in the brain, and the output node is that you recognize that you are looking at a sunset. In the exercise classification neural network, the input is the coordinates given by pose estimation, the output is the posture, and the hidden layers are the process that the neural network does in Python. In this thesis, an MLP neural network is used. MLP stands for multilayer perceptron and this is a feed-forward neural network where all layers are completely connected to each other (Gurney,2018).
Figure 9: Example of Neural Network from Davies,2013

### 2.7Data analysis

2.7.1Confusion Matrix To compare the model performances, confusion matrices are used. A confusion matrix is a summary of the performance of a classification model. In a confusion matrix, the predicted postures of the test data are compared to the actual postures. On the x-axis, we have predicted values, and on the y-axis, the actual values, see Figure10.
Figure 10: Multi-class confusion matrix from Kr¨uger,2016
 Suppose we consider the posture plank:1 in the confusion matrix. A value is true positive (TP) when the predicted posture is plank:1 and the actual posture is also plank:1. A value is false positive (FP) when the predicted posture is plank:1 while the actual posture is another posture (e.g. push-up:1). A value is true negative (TN) when for example the predicted posture is push-up:1 and the actual posture is squat:1. Keep in mind that plank:1 is considered here. Therefore, the predicted and actual posture can be anything but not plank:1. A value is false negative (FN) when for example the predicted posture is push-up:1 and the actual posture is plank:1. For every posture, there are individual TP, FP, TN, and FN values. In the explanation above, the TP, FP, TN, and FN are considered for plank:1. However, this can be done for every posture. In this paper, the assumption is made that a false negative is considered more detrimental to the performance of the model than a false positive. This assumption is made because people would get irritated if for example they did a push-up and it did not count. This can be demotivating for them. While a false positive does not have such negative effects on people.
2.7.2Performance indicators Accuracy
<u>T P + T N</u> *Accuracy* = *T P* + *F P* + *T N* + *F N* Accuracy is the percentage of predictions that were correct. That is, the total number of correct predictions (TP + TN) divided by the total number of predictions (TP + FP + TN + FN). Basing your assessment of the model purely on accuracy is not a good idea, since the accuracy score can

be misleading. For example, it is possible that your dataset has more negative values than positive values. This is the case in our data because a single exercise is tested against all other exercises. Therefore, there are more negative values than positive values. It is also possible to calculate the accuracy score for all exercises combined. Now, this problem is resolved.

Recall <u>T P</u> *Recall* = *T P* + *F N*

Recall is the fraction of the number of times the model was able to find the correct posture among actual positives of a specific exercise. Recall answers the question of what fraction of the test sample of a specific exercise the model was able to correctly identify. This performance indicator gives a good idea of how well the actual positive values are distributed. Every exercise has a specific recall score and there is not one recall score for the entire model, since it is not clearly defined what a positive value is when classifying all exercises. The overall recall score can be calculated by taking the average of all recall scores of every posture.

Precision <u>T P</u> *P recision* = *T P* + *F P*

While recall focuses on the actual positive values, precision focuses on the predicted positive values of a particular posture. Precision answers the question of how many of the positive predictions (TP and FP) are actually positive (TP). This is calculated for every posture. In order to get one precision score for the entire classification, again the mean for all precision scores can be used.

F1-Score <u>P recision ∗ Recall</u> *F* 1 *− score* = 2 *∗* *P recision* + *Recall* The F1-score is the harmonic mean of precision and recall. This performance indicator puts precision and recall into one score. The F1-score is high when both precision and recall are high, medium when both scores are low, and low when precision or recall is high while the other is low.

## 3Results

### 3.1Data collection

The data collection is the main topic of this thesis that differs from prior work. In the methods section, it is explained how the data is collected. Here, an overview will be given on what our dataset looks like. In total, 1729 data points are collected. Of these 1729 annotations, 616 are jumping-jack, 424 are squat, 480 are push-up, and 209 are plank. Keep in mind that jumping-jack, squat and push-up all have two postures, while plank only has one. This explains why plank has about half of the annotations of the other exercises.

### 3.2Model comparison

First, a comparison between the Human Pose Estimation algorithms is done. The Human Pose Es- timation method PoseNet has the highest overall accuracy (0.97) when using the best-performing classification model. The accuracies of the MoveNet and BlazePose are 0.96 and 0.94 respectively. Therefore, all the classification models that are discussed below use PoseNet for human pose recog- nition.

Table 1: Model performance indicators PoseNet (exercise)

|Model|Accuracy|Recall|Precision|F1-score|
|---|---|---|---|---|
|Nearest Neighbor|0.62|0.62|0.61|0.61|
|Logistic regression|0.54|0.55|0.52|0.52|
|Random forest|0.85|0.85|0.85|0.85|
|Gradient boosting|0.97|0.97|0.97|0.97|
|Neural network|0.59|0.59|0.59|0.59|
|Geometric algorithm|0.20|0.21|0.12|0.16|

Table1shows that the classifiers Random Forest and Gradient Boosting have the best accuracies with 0.85 and 0.97 respectively. The algorithms Nearest Neighbor, Logistic Regression, and Neural Network underperformed, with accuracy scores of 0.62, 0.54, and 0.59 respectively. The geometric algorithm has an even lower accuracy score of 0.20. Recall, precision, and F1-score indicators tell the same story. Here, Random Forest and Gradient Boosting once again come up on top, while the other algorithms struggle.

Table 2: Model Performance indicators Posenet (posture)

|Model|Accuracy|Recall|Precision|F1-score|
|---|---|---|---|---|
|Nearest Neighbor|0.34|0.34|0.32|0.32|
|Logistic regression|0.32|0.32|0.30|0.30|
|Random forest|0.46|0.45|0.46|0.45|
|Gradient boosting|0.52|0.52|0.52|0.52|
|Neural network|0.32|0.31|0.32|0.31|
|Geometric algortihm|0.14|0.26|0.15|0.19|

Table2shows all classifiers have problems when predicting the postures. The best algorithms are Random Forest and Gradient Boosting again. Their accuracies are 0.46 and 0.52 respectively, which

is a lot lower than their accuracies when comparing exercises. The recall, precision, and F1-score again tell the same story.

Table 3: Accuracy per model per exercise using PoseNet

|Exercise|KNN|LG|RF|GB|NN|GA|
|---|---|---|---|---|---|---|
|Jumping-jack|0.51|0.50|0.53|0.54|0.50|0.31|
|Squat|0.49|0.51|0.47|0.48|0.47|0.48|
|Push-up|0.48|0.44|0.50|0.54|0.47|0.47|
|Plank|0.77|0.72|0.94|0.95|0.78|0.27|

In Table3the accuracies for each model testing on one specific exercise are given (e.g. only jumping- jack:1 and jumping-jack:2 are used for training and testing). This allows for comparing the different models for an exercise. Table3shows that there is little difference between the algorithms in terms of their accuracies for classifying the different postures of the exercises. Since there is only one posture for the plank, the alternative posture that is given to the model is squat:1. We see that each model is better at classifying the postures for the plank than for the other exercises.

### 3.3Confusion matrices

3.3.1Per exercise When testing per exercise (e.g. jumping-jack, squat, etc.), and not per posture (e.g. jumping-jack:1, squat:1, etc.). The machine learning algorithms Random Forest and Gradient Boosting both perform very well. Figure11is the confusion matrix of the algorithm Gradient Boosting when testing for exercise recognition. This figure shows that the algorithm Gradient Boosting is great at classifying the different exercises. It only makes a few errors, mainly for the plank and the push-up.
Figure 11: Confusion matrix per exercise. HPE algorithm: PoseNet. ML algorithm: Gradient boosting

3.3.2Per posture Figure12shows the confusion matrix of the Gradient Boosting classifier when testing per posture. In this figure, it is clear to see that clusters exist inside the exercises. Outside of these exercises, the model only makes a few mistakes. This is in line with the results from Figure11. No model has a high accuracy score when comparing between the postures of each exercise. This behaviour can be seen for all machine learning algorithms. They have difficulty classifying each exercise’s postures individually.
Figure 12: Confusion matrix per posture. HPE algorithm: PoseNet. ML algorithm: Gradient boosting
 Figure13shows the confusion matrix of the geometric algorithm, again when testing per posture. The geometric algorithm has more difficulty than the machine learning algorithms. The accuracy scores are around 0.14. This confusion matrix differs quite a bit from the confusion matrices shown above. The postures push-up:1 and push-up:2 are never predicted, which is interesting. The postures plank:1 and squat:1 are predicted often.
19

Figure 13: Confusion matrix per posture. HPE algorithm: PoseNet. geometric algorithm

## 4Discussion

### 4.1Summary of findings

When comparing the different Human Pose Estimators, we find that PoseNet has the highest accuracy when using the best classifier (Gradient Boosting). This is in line with the literature (Jo and Kim,

2022). We conclude that the machine learning models Gradient Boosting and Random Forest are best for classifying the different exercises. However, no model is adequate for classifying the postures of the exercises correctly. This is not in line with what is reported in the literature. This is an interesting result since it is unclear why the clusters for every exercise exist. For example, the difference between the postures jumping-jack:2 and squat:1 is really small, since in both postures the person is standing upright with no other specifications. Despite these small differences, the models are able to differ- entiate between these two poses. Intuitively, there are more differences between squat:1 and squat:2 (e.g. the legs are bent in squat:2, while they are straight in squat:1), but the models are not able to make a distinction between these two poses. One possible explanation for the clusters is the diversity in camera angles used in the YouTube videos used for data collection. As stated before, most research to date makes their data set in a lab with restricting specifications. These specifications make the testing environment more controlled. When the prediction model suggested in this paper gets used with different specifications, the results may be worse. One interesting thing that was implemented in the model of Eivindsen and Kristensen to combat this is camera angle detection. This helped the machine learning exercise detection by first estimating the camera angle, and afterwards detecting the exercise. Therefore, the computer could know which camera angle is currently used and change its machine learning algorithm accordingly. Moreover, all algorithms struggle when the data of only one exercise is used as input. For example, all machine learning models have an accuracy of around 0.5 when the data only includes the exercise jumping-jack. The closely related article by Ferreira et al.,2020, does have a better score for classi- fication per posture (e.g. 0.975 accuracy when comparing the postures of jumping-jack). The major differences between this thesis and the article by B. Ferreira et al. (2020) are the camera setting and the usage of time series. The geometric algorithm has even more problems. No data point is classified as a push-up. This clustering happens because of the order in which the postures are tested. Moreover, the geometric algorithm also has problems with classifying the postures of only one exercise. The results show that the geometric algorithm made in this thesis is not a viable option for exercise classification.
### 4.2Dataset

In general, previous literature did not use a dataset that is as extensive as is used in this thesis. The relatively low amount of samples in papers can lead to over-fitting of the data. Also, the differences between the people in the data set are important. It is possible that an algorithm only works well for one group and not so well for another the results. We make use of a dataset of 1729 diverse data points. As a result, the model could be more generalizable, however, we also see that the posture classification does not work well enough for real-life applications.

### 4.3Limitations

For data collection, workout videos from the video website YouTube were used. This has its advantages since it made it possible to collect a lot more data than if we needed to make the videos ourselves. However, some things are different about their setting from a normal home workout setting. For example, the cameras used in the videos were of very high quality and professionally made, while the

average user of the project probably will use their mobile devices. The cameras smartphones and tablets are in most cases of worse quality.

### 4.4Future work

One way to improve the model performance is to take the camera angle into account. Chances are high that the high amount of differences in camera angle in our dataset made it very hard for the computer to classify the exercises and postures. One way to combat this is to add a new independent variable named ’camera angle’ to the model. This variable can have for example four different unique values (e.g. front, left, right, and behind). However, this will decrease the user experience because the person now needs to take on a specific position for the camera. Another way to possibly improve the performance is to first classify the camera angle before classifying the exercises and postures. This is done by Eivindsen and Kristensen,2020. Their formula only uses the x-coordinates of the left and right shoulders as input. Based on the horizontal distance between the shoulders, the formula classifies the image as either front or side angle. This formula works perfectly for their dataset. However, as said before, their dataset is more uniform than our dataset, which makes it easier for the formula to give a correct output. Still, it is a notable subject for future work. Also, research needs to be done on why the models struggle to classify the postures of an exercise. Now, it is not clear why these models struggle with this. This remains one of the big problems of machine learning; it is difficult to completely understand how the model comes to its conclusions. Interestingly, the clusters all have only one exercise inside them. One other thing to add in the future is time series analysis. This is used in a couple of papers cited in this thesis (e.g. Singh et al.,2022and Ferreira et al.,2020). The results of the time series are rather good. For a time series model, video input needs to be analyzed and the dataset used in this paper is based on screenshots and not videos. Therefore, a new dataset needs to be collected to utilize a time series model. Standardization of the data is also a good next step for future work. Standardization can be done by transforming the data points such the person is always regarded as facing the camera, also data points could be taken relative to the person’s torso. Moreover, the person could always be placed in the middle of the frame. This could help the classification model because now it would not matter how far the person is from the camera. Chen and Yang, (2020) did standardization with the length of the torso of the person in the picture (Chen and Yang,2020). Some other studies cited in this thesis do something similar to this. Implementing this in our model is a good next step for future work.

## 5Conclusion

In this study, we presented several classification models to classify four different fitness exercises. The created dataset is realistic, which means that the data represents the actual usage well and no constraints were placed on the camera angle, and distance to the camera. We conclude that the machine learning models classify the exercises in a realistic dataset well, with Gradient Boosting being the best. However, no algorithm could classify the postures of an exercise correctly and consistently. This inhibits the usage of the models in real-life applications. More research in time series analysis, camera angle classification, and standardization needs to be done in order to augment the clustering of postures within exercises.

## 6Acknowledgements

The author would like to express their sincerest gratitude towards their supervisor dr. ing. Raoul Nuijten for his continuous support to make this a successful bachelor-end project. The author also wants to thank Raoul Nuijten for making the website that was used to annotate the videos. The author would also like to thank dr. Sybren de Kinderen for taking the time to assess this thesis.

## References

Arrowsmith, C., Burns, D., Mak, T., Hardisty, M., & Whyne, C. (2023). Physiotherapy exercise classification with single-camera pose detection and machine learning. *Sensors*,*23*(1).https: //doi.org/10.3390/s23010363 Bazarevsky, V., Grishchenko, I., Raveendran, K., Zhu, T., Zhang, F., & Grundmann, M. (2020). Blazepose: On-device real-time body pose tracking. *CoRR*, *abs/2006.10204*.[https://arxiv](https://arxiv). org/abs/2006.10204 Breiman, L. (2001). Random forests. *Machine learning*, *45*, 5–32. Chen, S., & Yang, R. R. (2020). Pose trainer: Correcting exercise posture using pose estimation. *arXiv* *preprint arXiv:2006.11718*. Chiddarwar, G. G., Ranjane, A., Chindhe, M., Deodhar, R., & Gangamwar, P. (2020). Ai-based yoga pose estimation for android application. *Int J Inn Scien Res Tech*, *5*, 1070–1073. Davies, S. (2013). *Learning in spiking neural networks* (Doctoral dissertation). Citeseer. Dimitrova, M. (2022). Squat 20 times and get a free bus ride in cluj-napoca.[https://www.themayor](https://www.themayor). eu/en/a/view/squat-20-times-and-get-a-free-bus-ride-in-cluj-napoca-5994 Eivindsen, J. E., & Kristensen, B. Y. (2020). *Human pose estimation assisted fitness technique* *evaluation system* (Master’s thesis). NTNU. Ferreira, B., Ferreira, P. M., Pinheiro, G., Figueiredo, N., Carvalho, F., Menezes, P., & Batista, J. (2020). Exploring workout repetition counting and validation through deep learning. In A. Campilho, F. Karray, & Z. Wang (Eds.), *Image analysis and recognition* (pp. 3–15). Springer International Publishing. Gallego, A.-J., Calvo-Zaragoza, J., Valero-Mas, J. J., & Rico-Juan, J. R. (2018). Clustering-based k- nearest neighbor classification for large-scale data with neural codes representation. *Pattern* *Recognition*, *74*, 531–543. Gurney, K. (2018). *An introduction to neural networks*. CRC press. Jo, B., & Kim, S. (2022). Comparative analysis of openpose, posenet, and movenet models for pose estimation in mobile devices. *Traitement du Signal*, *39*(1), 119–124. Kr¨uger, F. (2016). *Activity, context, and plan recognition with computational causal behaviour models* (Doctoral dissertation). University. Natekin, A., & Knoll, A. (2013). Gradient boosting machines, a tutorial. *Frontiers in neurorobotics*, *7*, 21. Rahmadani, A., Bayu Dewantara, B. S., & Sari, D. M. (2022). Human pose estimation for fitness exercise movement correction. *2022 International Electronics Symposium (IES)*, 484–490. [https://doi.org/10.1109/IES55876.2022.9888451](https://doi.org/10.1109/IES55876.2022.9888451) Singh, A., Le, B. T., Nguyen, T. L., Whelan, D., O’Reilly, M., Caulfield, B., & Ifrim, G. (2022). Interpretable classification of human exercise videos through pose estimation and multivariate time series analysis. In A. Shaban-Nejad, M. Michalowski, & S. Bianco (Eds.), *Ai for disease* *surveillance and pandemic intelligence: Intelligent disease detection in action* (pp. 181–199). Springer International Publishing.[https://doi.org/10.1007/978-3-030-93080-6](https://doi.org/10.1007/978-3-030-93080-6) 14 Song, Y.-Y., & Ying, L. (2015). Decision tree methods: Applications for classification and prediction. *Shanghai archives of psychiatry*, *27*(2), 130. Thoma, M. (2014). File:sigmoid-function-2.svg.[https://commons.wikimedia.org/wiki/File:Sigmoid-](https://commons.wikimedia.org/wiki/File:Sigmoid-) function-2.svg%5C%7D Varshney, A. (2021). The advent of pose estimation.[https://medium.com/@adityavarshney99/the-](https://medium.com/@adityavarshney99/the-) advent-of-pose-estimation-ec8ea2ca46d4

## 7Appendices

### 7.1Appendix A

List of all postures and a quick description. Jumping-jack:1 Arms are above the head and the legs are apart. Can be seen as the ‘up’ position of the jumping-jack. Jumping-jack:2 Arms are sown and close to body. Legs are close together. Can be seen as the ‘down’ position of the jumping-jack Push-up:1 Arms and feet are on the ground and the arms are straight. The body is in a straight line. Can be seen as the ‘up’ position of the push-up. Push-up:2 Arms are curved and body is close to the ground. Elbows are at an 90 degree angle. Body is in a straight horizontal line. Can be seen as the ‘down’ position of the push-up. Squat:1 Body is in a straight vertical line and the legs are straight. Can be seen as the ‘up’ position of the squat. Squat:2 legs are curved and body is lower to the ground. Can be seen as the ‘down’ position of the squat. Plank:1 forearms and toes are on the ground and body is in horizontal line.

### 7.2Appendix B

Sequence of tesing of geometric algorithm:

1. Plank:1
2. Jumping-jack:1
3. Jumping-jack:2
4. Push-up:1
5. Push-up:2
6. Squat:1
7. Squat:2
26
